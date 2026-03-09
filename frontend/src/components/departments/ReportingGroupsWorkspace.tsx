import React from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { Department, OrgChartWorkspace, ReportingGroup } from '@/types/models';
import { orgChartWorkspaceApi, reportingGroupsApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const SNAP_SIZE = 24;
const SAVE_DEBOUNCE_MS = 600;
const CARD_WIDTH = 280;
const ROOT_WIDTH = 320;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const snap = (value: number): number => Math.round(value / SNAP_SIZE) * SNAP_SIZE;

type Props = {
  department: Department;
};

type DraggedCardMeta =
  | { type: 'department'; startX: number; startY: number }
  | { type: 'group'; groupId: number; startX: number; startY: number };

const parseGroupId = (id: string, prefix: string): number | null => {
  if (!id.startsWith(prefix)) return null;
  const raw = id.slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const DropZone: React.FC<React.PropsWithChildren<{ id: string; className?: string; testId?: string }>> = ({
  id,
  className,
  testId,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-testid={testId}
      className={`${className || ''} ${isOver ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--surface)]' : ''}`}
    >
      {children}
    </div>
  );
};

const DraggableChip: React.FC<{ id: string; disabled?: boolean; testId?: string; children: React.ReactNode }> = ({
  id,
  disabled,
  testId,
  children,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      data-testid={testId}
      {...attributes}
      {...listeners}
      className={`inline-flex select-none touch-none items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text)] ${disabled ? '' : 'cursor-grab'} ${isDragging ? 'opacity-50' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      {children}
    </div>
  );
};

const DraggableCard: React.FC<{
  id: string;
  left: number;
  top: number;
  disabled?: boolean;
  width: number;
  testId?: string;
  children: React.ReactNode;
}> = ({ id, left, top, disabled, width, testId, children }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      data-testid={testId}
      className={`absolute ${disabled ? '' : 'touch-none'} ${isDragging ? 'z-30' : 'z-10'}`}
      style={{
        left,
        top,
        width,
        transform: CSS.Translate.toString(transform),
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

const ReportingGroupsWorkspace: React.FC<Props> = ({ department }) => {
  const departmentId = Number(department.id || 0);
  const isMobileLayout = useMediaQuery('(max-width: 767px)');
  const [workspace, setWorkspace] = React.useState<OrgChartWorkspace | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editMode, setEditMode] = React.useState(true);
  const [zoom, setZoom] = React.useState(1);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardDragRef = React.useRef<DraggedCardMeta | null>(null);

  const loadWorkspace = React.useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await orgChartWorkspaceApi.get(departmentId);
      if (!data.featureEnabled) {
        setWorkspace(null);
        setLoading(false);
        return;
      }
      setWorkspace(data);
      if (!data.canEdit) setEditMode(false);
    } catch (e: any) {
      if (e?.status === 404) {
        setWorkspace(null);
      } else {
        setError(e?.message || 'Failed to load reporting groups workspace');
      }
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  React.useEffect(() => {
    void loadWorkspace();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [loadWorkspace]);

  const canEdit = !!workspace?.canEdit && editMode;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 8 } }),
  );

  const peopleById = React.useMemo(() => {
    const map = new Map<number, OrgChartWorkspace['people'][number]>();
    (workspace?.people || []).forEach((person) => map.set(person.id, person));
    return map;
  }, [workspace?.people]);

  const computeDerivedWorkspace = React.useCallback((source: OrgChartWorkspace): OrgChartWorkspace => {
    const managerIds = new Set<number>();
    const memberIds = new Set<number>();
    source.groups.forEach((group) => {
      if (group.managerId != null) managerIds.add(group.managerId);
      (group.memberIds || []).forEach((id) => memberIds.add(id));
    });
    const unassignedPersonIds = (source.people || [])
      .map((person) => person.id)
      .filter((personId) => !managerIds.has(personId) && !memberIds.has(personId));
    return {
      ...source,
      unassignedPersonIds,
    };
  }, []);

  const queueLayoutSave = React.useCallback((nextWorkspace: OrgChartWorkspace) => {
    if (!nextWorkspace.canEdit) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const saved = await reportingGroupsApi.saveLayout(departmentId, {
          workspaceVersion: nextWorkspace.workspaceVersion,
          departmentCard: nextWorkspace.departmentCard,
          groups: nextWorkspace.groups.map((group) => ({
            id: group.id,
            x: group.card.x,
            y: group.card.y,
            managerId: group.managerId ?? null,
            memberIds: group.memberIds || [],
            sortOrder: group.sortOrder,
          })),
        });
        setWorkspace(saved);
      } catch (e: any) {
        if (e?.status === 409) {
          try {
            const latest = await orgChartWorkspaceApi.get(departmentId);
            const replay = await reportingGroupsApi.saveLayout(departmentId, {
              workspaceVersion: latest.workspaceVersion,
              departmentCard: nextWorkspace.departmentCard,
              groups: nextWorkspace.groups.map((group) => ({
                id: group.id,
                x: group.card.x,
                y: group.card.y,
                managerId: group.managerId ?? null,
                memberIds: group.memberIds || [],
                sortOrder: group.sortOrder,
              })),
            });
            setWorkspace(replay);
          } catch (replayError: any) {
            setError(replayError?.message || 'Failed to resolve layout conflict');
            showToast(replayError?.message || 'Failed to resolve layout conflict', 'error');
          }
        } else {
          setError(e?.message || 'Failed to save layout');
          showToast(e?.message || 'Failed to save layout', 'error');
        }
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [departmentId]);

  const applyWorkspaceMutation = React.useCallback((mutate: (current: OrgChartWorkspace) => OrgChartWorkspace) => {
    setWorkspace((current) => {
      if (!current) return current;
      const next = computeDerivedWorkspace(mutate(current));
      queueLayoutSave(next);
      return next;
    });
  }, [computeDerivedWorkspace, queueLayoutSave]);

  const removePersonFromAssignments = React.useCallback((target: OrgChartWorkspace, personId: number): OrgChartWorkspace => {
    const nextGroups = target.groups.map((group) => ({
      ...group,
      managerId: group.managerId === personId ? null : group.managerId,
      memberIds: (group.memberIds || []).filter((id) => id !== personId),
    }));
    return { ...target, groups: nextGroups };
  }, []);

  const onDragStart = React.useCallback((event: DragStartEvent) => {
    if (!workspace) return;
    const activeId = String(event.active.id);
    if (activeId === 'card:department') {
      cardDragRef.current = {
        type: 'department',
        startX: workspace.departmentCard.x,
        startY: workspace.departmentCard.y,
      };
      return;
    }
    const groupId = parseGroupId(activeId, 'card:group:');
    if (groupId != null) {
      const group = workspace.groups.find((item) => item.id === groupId);
      if (!group) return;
      cardDragRef.current = {
        type: 'group',
        groupId,
        startX: group.card.x,
        startY: group.card.y,
      };
      return;
    }
    cardDragRef.current = null;
  }, [workspace]);

  const onDragEnd = React.useCallback((event: DragEndEvent) => {
    if (!workspace) return;
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : '';
    const canvasWidth = canvasRef.current?.clientWidth || 1200;
    const canvasHeight = canvasRef.current?.clientHeight || 720;

    if (cardDragRef.current) {
      const meta = cardDragRef.current;
      cardDragRef.current = null;
      const targetWidth = meta.type === 'department' ? ROOT_WIDTH : CARD_WIDTH;
      const nextX = snap(clamp(meta.startX + event.delta.x, 8, Math.max(8, canvasWidth - targetWidth - 8)));
      const nextY = snap(clamp(meta.startY + event.delta.y, 8, Math.max(8, canvasHeight - 180)));
      applyWorkspaceMutation((current) => {
        if (meta.type === 'department') {
          return {
            ...current,
            departmentCard: { x: nextX, y: nextY },
          };
        }
        return {
          ...current,
          groups: current.groups.map((group) => (
            group.id === meta.groupId ? { ...group, card: { x: nextX, y: nextY } } : group
          )),
        };
      });
      return;
    }

    const personId = parseGroupId(activeId, 'person:');
    if (personId == null) return;

    if (overId.startsWith('drop:manager:')) {
      const targetGroupId = parseGroupId(overId, 'drop:manager:');
      if (targetGroupId == null) return;
      applyWorkspaceMutation((current) => {
        const withoutPerson = removePersonFromAssignments(current, personId);
        return {
          ...withoutPerson,
          groups: withoutPerson.groups.map((group) => (
            group.id === targetGroupId ? { ...group, managerId: personId } : group
          )),
        };
      });
      return;
    }

    if (overId.startsWith('drop:members:')) {
      const targetGroupId = parseGroupId(overId, 'drop:members:');
      if (targetGroupId == null) return;
      applyWorkspaceMutation((current) => {
        const withoutPerson = removePersonFromAssignments(current, personId);
        return {
          ...withoutPerson,
          groups: withoutPerson.groups.map((group) => (
            group.id === targetGroupId
              ? { ...group, memberIds: [...(group.memberIds || []), personId] }
              : group
          )),
        };
      });
      return;
    }

    if (overId === 'drop:unassigned') {
      applyWorkspaceMutation((current) => removePersonFromAssignments(current, personId));
    }
  }, [workspace, applyWorkspaceMutation, removePersonFromAssignments]);

  const createGroup = async () => {
    if (!workspace?.canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await reportingGroupsApi.create(departmentId, { name: 'New Reporting Group' });
      await loadWorkspace();
      showToast('Reporting group created', 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to create reporting group');
      showToast(e?.message || 'Failed to create reporting group', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = async (group: ReportingGroup) => {
    if (!workspace?.canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await reportingGroupsApi.remove(departmentId, group.id);
      await loadWorkspace();
      showToast(`Removed ${group.name}`, 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to remove reporting group');
      showToast(e?.message || 'Failed to remove reporting group', 'error');
    } finally {
      setSaving(false);
    }
  };

  const autoLayout = () => {
    if (!workspace?.canEdit) return;
    const width = canvasRef.current?.clientWidth || 1200;
    const columns = isMobileLayout ? 2 : Math.max(2, Math.floor(width / 320));
    applyWorkspaceMutation((current) => {
      const sorted = [...current.groups].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
      const laidOut = sorted.map((group, idx) => {
        const col = idx % columns;
        const row = Math.floor(idx / columns);
        return {
          ...group,
          card: {
            x: 16 + col * 300,
            y: 192 + row * 260,
          },
          sortOrder: (idx + 1) * 10,
        };
      });
      return {
        ...current,
        departmentCard: { x: 16, y: 24 },
        groups: laidOut,
      };
    });
  };

  if (loading) {
    return (
      <Card className="bg-[var(--color-surface-elevated)] border-[var(--color-border)] p-4">
        <div className="text-sm text-[var(--muted)]">Loading reporting groups workspace...</div>
      </Card>
    );
  }

  if (!workspace) return null;

  return (
    <Card className="bg-[var(--color-surface-elevated)] border-[var(--color-border)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">Reporting Groups Workspace</h3>
          <p className="text-xs text-[var(--muted)]">
            Drag department and reporting-group cards. Drag people into manager slots or member lanes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}>−</Button>
          <div className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</div>
          <Button variant="ghost" size="sm" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}>+</Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>Reset</Button>
          {workspace.canEdit ? (
            <Button variant="ghost" size="sm" onClick={() => setEditMode((value) => !value)}>
              {canEdit ? 'Lock' : 'Edit'}
            </Button>
          ) : null}
          {workspace.canEdit ? (
            <>
              <Button variant="ghost" size="sm" onClick={autoLayout} disabled={!canEdit || saving}>Auto-layout</Button>
              <Button variant="primary" size="sm" onClick={createGroup} disabled={!canEdit || saving}>Add Group</Button>
            </>
          ) : null}
        </div>
      </div>

      {saving ? <div className="mb-2 text-xs text-[var(--muted)]">Saving changes...</div> : null}
      {error ? <div className="mb-2 text-xs text-red-400">{error}</div> : null}
      {isMobileLayout ? (
        <div className="mb-2 text-xs text-[var(--muted)]">
          Mobile editing is enabled. Use Edit mode to avoid accidental drag while scrolling.
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <DropZone id="drop:unassigned" testId="rg-unassigned" className="mb-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Unassigned People</div>
          <div className="flex flex-wrap gap-2">
            {workspace.unassignedPersonIds.map((personId) => {
              const person = peopleById.get(personId);
              if (!person) return null;
              return (
                <DraggableChip key={person.id} id={`person:${person.id}`} testId={`rg-person-${person.id}`} disabled={!canEdit}>
                  <span>{person.name}</span>
                </DraggableChip>
              );
            })}
            {workspace.unassignedPersonIds.length === 0 ? (
              <span className="text-xs text-[var(--muted)]">Everyone is currently assigned to a reporting group.</span>
            ) : null}
          </div>
        </DropZone>

        <div className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div
            ref={canvasRef}
            className="relative min-h-[680px] min-w-[860px]"
            style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          >
            <DraggableCard
              id="card:department"
              width={ROOT_WIDTH}
              left={workspace.departmentCard.x}
              top={workspace.departmentCard.y}
              testId="rg-department-card"
              disabled={!canEdit}
            >
              <Card className="border-[var(--color-border)] bg-[var(--card)] p-4 shadow-lg">
                <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Department</div>
                <div className="mt-1 text-sm font-semibold text-[var(--text)]">{department.name}</div>
              </Card>
            </DraggableCard>

            {workspace.groups.map((group) => {
              const manager = group.managerId != null ? peopleById.get(group.managerId) : null;
              return (
                <DraggableCard
                  key={group.id}
                  id={`card:group:${group.id}`}
                  width={CARD_WIDTH}
                  left={group.card.x}
                  top={group.card.y}
                  testId={`rg-group-card-${group.id}`}
                  disabled={!canEdit}
                >
                  <Card className="border-[var(--color-border)] bg-[var(--card)] p-3 shadow" data-testid={`rg-group-${group.id}`}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-[var(--text)]">{group.name}</div>
                      {canEdit ? (
                        <button
                          type="button"
                          className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
                          onClick={() => void removeGroup(group)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <DropZone id={`drop:manager:${group.id}`} testId={`rg-manager-drop-${group.id}`} className="mb-2 rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Manager</div>
                      <div className="mt-1 min-h-6 text-xs text-[var(--text)]">
                        {manager ? manager.name : 'Drop a person here'}
                      </div>
                    </DropZone>

                    <DropZone id={`drop:members:${group.id}`} testId={`rg-members-drop-${group.id}`} className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">Members</div>
                      <div className="flex min-h-10 flex-wrap gap-1">
                        {(group.memberIds || []).map((memberId) => {
                          const person = peopleById.get(memberId);
                          if (!person) return null;
                          return (
                            <DraggableChip key={person.id} id={`person:${person.id}`} testId={`rg-person-${person.id}`} disabled={!canEdit}>
                              <span>{person.name}</span>
                            </DraggableChip>
                          );
                        })}
                        {(group.memberIds || []).length === 0 ? (
                          <span className="text-xs text-[var(--muted)]">Drop members here</span>
                        ) : null}
                      </div>
                    </DropZone>
                  </Card>
                </DraggableCard>
              );
            })}
          </div>
        </div>
      </DndContext>
    </Card>
  );
};

export default ReportingGroupsWorkspace;
