import React from 'react';
import { InlineDate, InlineText, InlineTextarea } from '@/components/ui/InlineEdit';
import { projectsApi } from '@/services/api';
import type { ProjectMetadataFieldsProps } from '@/pages/Projects/list/components/projectDetailsPanel.types';

const ProjectMetadataFields: React.FC<ProjectMetadataFieldsProps> = ({
  project,
  localPatch,
  canEdit,
  canEditAutoHoursTemplate,
  fieldErrors,
  setFieldErrors,
  clearFieldError,
  commitField,
  currentVerticalId,
  isVerticalMissing,
  verticals,
  verticalsLoading,
  selectedVerticalId,
  selectedAutoHoursTemplateId,
  selectedAutoHoursTemplateName,
  isAutoHoursTemplateMissing,
  autoHoursTemplates,
  autoHoursTemplatesLoading,
  autoHoursTemplatesError,
  promptAndUpdateHours,
}) => {
  const [clientOptions, setClientOptions] = React.useState<string[] | null>(null);
  const [filteredClients, setFilteredClients] = React.useState<string[]>([]);
  const [clientOpen, setClientOpen] = React.useState(false);
  const clientBoxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (clientBoxRef.current && !clientBoxRef.current.contains(target)) setClientOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 text-sm" style={{ gridTemplateColumns: 'minmax(320px,1fr) 1fr' }}>
        <div>
          <div className="text-[var(--muted)] text-xs">Client:</div>
          <div className="text-[var(--text)] relative" ref={clientBoxRef}>
            <InlineText
              value={(localPatch.client ?? project.client) || ''}
              onCommit={async (v) => {
                const nextValue = (v ?? '').toString();
                await commitField('client', nextValue);
                setClientOpen(false);
              }}
              onStartEdit={async () => {
                clearFieldError('client');
                try {
                  if (!clientOptions) {
                    const list = await projectsApi.getClients({ vertical: selectedVerticalId ?? undefined });
                    setClientOptions(list);
                    setFilteredClients(list);
                  } else {
                    setFilteredClients(clientOptions);
                  }
                  setClientOpen(true);
                } catch {}
              }}
              onDraftChange={(val) => {
                clearFieldError('client');
                const search = (val ?? '').toString().toLowerCase();
                const base = clientOptions || [];
                const next = search ? base.filter((name) => name.toLowerCase().includes(search)) : base;
                setFilteredClients(next);
                setClientOpen(true);
              }}
              placeholder="No Client"
              ariaLabel="Edit client"
              disabled={!canEdit}
            />
            {clientOpen && filteredClients.length > 0 && (
              <div className="absolute z-50 mt-1 left-0 right-0 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg max-h-48 overflow-auto">
                {filteredClients.slice(0, 30).map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] text-[var(--text)]"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={async () => {
                      await commitField('client', name);
                      setClientOpen(false);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {fieldErrors.client && <div className="text-red-400 text-xs mt-1">{fieldErrors.client}</div>}
        </div>

        <div>
          <div className="text-[var(--muted)] text-xs">No:</div>
          <div className="text-[var(--text)]">
            <InlineText
              value={(localPatch.projectNumber ?? project.projectNumber) || ''}
              onCommit={async (v) => {
                const nextValue = (v ?? '').toString();
                await commitField('projectNumber', nextValue, {
                  onError: () => setFieldErrors((prev) => ({ ...prev, projectNumber: 'Project Number must be unique' })),
                });
              }}
              onStartEdit={() => clearFieldError('projectNumber')}
              onDraftChange={() => clearFieldError('projectNumber')}
              placeholder="-"
              ariaLabel="Edit project number"
              disabled={!canEdit}
            />
          </div>
          {fieldErrors.projectNumber && <div className="text-red-400 text-xs mt-1">{fieldErrors.projectNumber}</div>}
        </div>

        <div>
          <div className="text-[var(--muted)] text-xs">Vertical:</div>
          <div className="flex items-center gap-2">
            <select
              className="min-w-[220px] bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-sm focus:border-[var(--primary)] disabled:opacity-60"
              value={currentVerticalId ?? ''}
              onChange={async (e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                await commitField('vertical', next);
              }}
              disabled={!canEdit || verticalsLoading}
              aria-label="Project vertical"
            >
              <option value="">{verticalsLoading ? 'Loading verticals...' : 'Select vertical'}</option>
              {isVerticalMissing && currentVerticalId != null && (
                <option value={currentVerticalId}>Unknown vertical</option>
              )}
              {verticals.map((vertical) => (
                <option key={vertical.id} value={vertical.id}>
                  {vertical.shortName ? `${vertical.name} (${vertical.shortName})` : vertical.name}
                </option>
              ))}
            </select>
            {!canEdit && (
              <span className="text-xs text-[var(--muted)]">{project.verticalName || '—'}</span>
            )}
            {verticalsLoading && (
              <span className="text-xs text-[var(--muted)]">Loading…</span>
            )}
          </div>
          {fieldErrors.vertical && <div className="text-red-400 text-xs mt-1">{fieldErrors.vertical}</div>}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[var(--muted)] text-xs mb-1">Description:</div>
        <InlineTextarea
          value={(localPatch.description ?? project.description) || ''}
          onCommit={async (v) => {
            const nextValue = (v ?? '').toString();
            await commitField('description', nextValue);
          }}
          onStartEdit={() => clearFieldError('description')}
          onDraftChange={() => clearFieldError('description')}
          placeholder="Add a short description"
          ariaLabel="Edit project description"
          disabled={!canEdit}
          rows={3}
          className="text-[var(--text)]"
        />
        {fieldErrors.description && <div className="text-red-400 text-xs mt-1">{fieldErrors.description}</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        <div>
          <div className="text-[var(--muted)] text-xs mb-1">Start Date:</div>
          <InlineDate
            value={(localPatch.startDate ?? project.startDate) || null}
            onCommit={async (v) => {
              const previousStartDate = ((localPatch.startDate ?? project.startDate) || null) as string | null;
              const nextStartDate = (v || null) as string | null;
              await commitField('startDate', nextStartDate);
              if (previousStartDate === nextStartDate) return;
              await promptAndUpdateHours(
                'start_date_changed',
                nextStartDate,
                selectedAutoHoursTemplateId != null ? Number(selectedAutoHoursTemplateId) : null
              );
            }}
            onStartEdit={() => clearFieldError('startDate')}
            onDraftChange={() => clearFieldError('startDate')}
            placeholder="—"
            ariaLabel="Edit start date"
            disabled={!canEdit}
          />
          {fieldErrors.startDate && <div className="text-red-400 text-xs mt-1">{fieldErrors.startDate}</div>}
        </div>
        <div>
          <div className="text-[var(--muted)] text-xs mb-1">Estimated Hours:</div>
          <InlineText
            value={typeof (localPatch.estimatedHours ?? project.estimatedHours) === 'number'
              ? String(localPatch.estimatedHours ?? project.estimatedHours)
              : ''}
            onCommit={async (v) => {
              const text = (v ?? '').toString().trim();
              const parsed = text === '' ? undefined : Math.max(0, Math.floor(Number(text)));
              if (text !== '' && Number.isNaN(parsed)) return;
              await commitField('estimatedHours', parsed as any);
            }}
            onStartEdit={() => clearFieldError('estimatedHours')}
            onDraftChange={() => clearFieldError('estimatedHours')}
            placeholder="—"
            ariaLabel="Edit estimated hours"
            disabled={!canEdit}
          />
          {fieldErrors.estimatedHours && <div className="text-red-400 text-xs mt-1">{fieldErrors.estimatedHours}</div>}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[var(--muted)] text-xs mb-1">Project Template:</div>
        <div className="flex items-center gap-2">
          <select
            className="min-w-[220px] bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-sm focus:border-[var(--primary)] disabled:opacity-60"
            value={selectedAutoHoursTemplateId ?? ''}
            onChange={async (e) => {
              const previousTemplateId = selectedAutoHoursTemplateId != null ? Number(selectedAutoHoursTemplateId) : null;
              const next = e.target.value ? Number(e.target.value) : null;
              await commitField('autoHoursTemplateId', next);
              if (previousTemplateId === next) return;
              const effectiveStartDate = ((localPatch.startDate ?? project.startDate) || null) as string | null;
              await promptAndUpdateHours('template_changed', effectiveStartDate, next);
            }}
            disabled={!canEditAutoHoursTemplate || autoHoursTemplatesLoading}
            aria-label="Auto hours template"
          >
            <option value="">Global default</option>
            {isAutoHoursTemplateMissing && selectedAutoHoursTemplateId && (
              <option value={selectedAutoHoursTemplateId}>{selectedAutoHoursTemplateName}</option>
            )}
            {autoHoursTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          {!canEditAutoHoursTemplate && (
            <span className="text-xs text-[var(--muted)]">{selectedAutoHoursTemplateName}</span>
          )}
          {autoHoursTemplatesLoading && (
            <span className="text-xs text-[var(--muted)]">Loading…</span>
          )}
        </div>
        {autoHoursTemplatesError && (
          <div className="text-red-400 text-xs mt-1">{autoHoursTemplatesError}</div>
        )}
      </div>
    </>
  );
};

export default ProjectMetadataFields;
