import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type SortableListItem = {
  id: number;
  label: string | React.ReactNode;
};

function GrabHandle() {
  return (
    <span className="text-[var(--muted)] cursor-grab" title="Drag to reorder" aria-label="Drag handle">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <circle cx="5" cy="5" r="1"/>
        <circle cx="5" cy="10" r="1"/>
        <circle cx="5" cy="15" r="1"/>
        <circle cx="10" cy="5" r="1"/>
        <circle cx="10" cy="10" r="1"/>
        <circle cx="10" cy="15" r="1"/>
      </svg>
    </span>
  );
}

function SortableRow({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    background: isDragging ? 'var(--surfaceHover)' : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2 min-w-0" {...listeners}>
        <GrabHandle />
        {children}
      </div>
    </div>
  );
}

export default function SortableList({
  items,
  onReorder,
  renderActions,
  disabled,
}: {
  items: SortableListItem[];
  onReorder: (ids: number[]) => void | Promise<void>;
  renderActions?: (id: number) => React.ReactNode;
  disabled?: boolean;
}) {
  const [order, setOrder] = React.useState<number[]>(items.map(i => i.id));
  React.useEffect(() => {
    setOrder(items.map(i => i.id));
  }, [items.map(i => i.id).join(',')]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(Number(active.id));
    const newIndex = order.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    void Promise.resolve(onReorder(next));
  }

  if (disabled) {
    // Render non-draggable static list
    return (
      <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md bg-[var(--surface)]">
        {order.map(id => {
          const item = items.find(i => i.id === id);
          if (!item) return null;
          return (
            <div key={id} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[var(--muted)]" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><circle cx="5" cy="5" r="1"/><circle cx="5" cy="10" r="1"/><circle cx="5" cy="15" r="1"/><circle cx="10" cy="5" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="10" cy="15" r="1"/></svg>
                </span>
                <div className="text-sm truncate text-[var(--text)]">{item.label}</div>
              </div>
              <div className="shrink-0">{renderActions ? renderActions(id) : null}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md bg-[var(--surface)]">
          {order.map(id => {
            const item = items.find(i => i.id === id);
            if (!item) return null;
            return (
              <SortableRow id={id} key={id}>
                <div className="text-sm truncate text-[var(--text)]">{item.label}</div>
                <div className="shrink-0">{renderActions ? renderActions(id) : null}</div>
              </SortableRow>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

