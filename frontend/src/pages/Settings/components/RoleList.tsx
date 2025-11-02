/**
 * RoleList Component - Display roles with clickable sortable headers
 * Phase 2.3: Follows TABLE COLUMN SORTING STANDARDS
 */

import React, { useState } from 'react';
import { formatUtcToLocal } from '@/utils/dates';
import { Role } from '@/types/models';

interface RoleListProps {
  roles: Role[];
  onEditRole: (role: Role) => void;
  onDeleteRole: (role: Role) => void;
  loading: boolean;
  onReorder?: (ids: number[]) => void | Promise<void>;
}

const RoleList: React.FC<RoleListProps> = ({ 
  roles, 
  onEditRole, 
  onDeleteRole, 
  loading,
  onReorder,
}) => {
  const [sortBy, setSortBy] = useState<'name' | 'description' | 'createdAt'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Handle column header clicks for sorting
  const handleColumnSort = (column: 'name' | 'description' | 'createdAt') => {
    if (sortBy === column) {
      // Toggle direction if clicking the same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and reset to ascending
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  // Sortable column header component - CRITICAL: follows TABLE COLUMN SORTING STANDARDS
  const SortableHeader = ({ 
    column, 
    children, 
    className = "" 
  }: { 
    column: 'name' | 'description' | 'createdAt';
    children: React.ReactNode; 
    className?: string;
  }) => (
    <button
      onClick={() => handleColumnSort(column)}
      className={`flex items-center gap-1 text-left hover:text-[var(--text)] transition-colors ${className}`}
    >
      {children}
      {sortBy === column && (
        <svg 
          className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      )}
    </button>
  );

  // Sort roles based on current sort settings (fallback when not using server order)
  const sortedRoles = [...roles].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'description':
        const aDesc = a.description || '';
        const bDesc = b.description || '';
        comparison = aDesc.localeCompare(bDesc);
        break;
      case 'createdAt':
        const aDate = new Date(a.createdAt || '').getTime();
        const bDate = new Date(b.createdAt || '').getTime();
        comparison = aDate - bDate;
        break;
      default:
        comparison = a.name.localeCompare(b.name);
        break;
    }

    return sortDirection === 'desc' ? -comparison : comparison;
  });

  if (loading) {
    return (
      <div className="text-[var(--muted)] py-8 text-center">
        Loading roles...
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="text-[var(--muted)] py-8 text-center">
        <div className="mb-2">No roles found</div>
        <div className="text-sm">Click "Add Role" to create your first role</div>
      </div>
    );
  }

  // Basic drag state for manual ordering (uses server order of input list)
  const [dragOrder, setDragOrder] = useState<number[] | null>(null);
  const order = dragOrder ?? roles.map(r => r.id);
  function onDragStart(e: React.DragEvent, id: number) { e.dataTransfer.effectAllowed = 'move'; setDragOrder(order.slice()); }
  function onDragOver(e: React.DragEvent, overId: number) {
    if (!dragOrder) return; e.preventDefault();
    const next = dragOrder.slice();
    const draggingId = Number(e.dataTransfer.getData('text/plain')) || next[0];
    // Use element attribute to track dragging id if not set
    const from = next.indexOf(draggingId);
    const to = next.indexOf(overId);
    if (from === -1 || to === -1 || from === to) return;
    next.splice(from, 1); next.splice(to, 0, draggingId);
    setDragOrder(next);
  }
  async function onDropFinalize() {
    if (!dragOrder) return;
    const ids = dragOrder.slice();
    setDragOrder(null);
    if (onReorder) await onReorder(ids);
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="block sm:hidden space-y-2">
        {sortedRoles.map((role) => (
          <div key={role.id} className="bg-[var(--card)] border border-[var(--border)] rounded p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[var(--text)] font-medium">{role.name}</div>
                <div className="text-[var(--muted)] text-xs mt-1">
                  {role.description || 'No description'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${role.isActive ? 'bg-emerald-400' : 'bg-[var(--muted)]'}`} title={role.isActive ? 'Active' : 'Inactive'} />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditRole(role)}
                    className="text-[var(--muted)] hover:text-[var(--primary)] p-1 rounded transition-colors"
                    aria-label={`Edit role ${role.name}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteRole(role)}
                    className="text-[var(--muted)] hover:text-red-400 p-1 rounded transition-colors"
                    aria-label={`Delete role ${role.name}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/>
                      <path d="m19,6v14a2,2 0 0 1 -2,2H7a2,2 0 0 1 -2,-2V6m3,0V4a2,2 0 0 1 2,-2h4a2,2 0 0 1 2,2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div className="text-[var(--muted)] text-xs mt-2">
              Created: {role.createdAt ? formatUtcToLocal(role.createdAt) : '-'}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop/tablet: original table layout */}
      <div className="hidden sm:block overflow-x-auto">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-[var(--surfaceHover)] border-b border-[var(--border)] text-sm font-medium text-[var(--muted)] rounded-t-md">
          <div className="col-span-3">
            <SortableHeader column="name">ROLE NAME</SortableHeader>
          </div>
          <div className="col-span-5">
            <SortableHeader column="description">DESCRIPTION</SortableHeader>
          </div>
          <div className="col-span-2">
            <SortableHeader column="createdAt">CREATED</SortableHeader>
          </div>
          <div className="col-span-1 text-center">STATUS</div>
          <div className="col-span-1 text-center">ACTIONS</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-[var(--border)]">
        {(dragOrder ? order.map(id => roles.find(r => r.id === id)!).filter(Boolean) : sortedRoles).map((role) => (
          <div
            key={role.id}
            className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-[var(--surfaceHover)] transition-colors"
            draggable={!!onReorder}
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(role.id)); onDragStart(e, role.id); }}
            onDragOver={(e) => onDragOver(e, role.id)}
            onDragEnd={onDropFinalize}
          >
              {/* Role Name + Grab handle */}
              <div className="col-span-3 flex items-center gap-2">
                {onReorder && (
                  <span className="text-[var(--muted)] cursor-grab" title="Drag to reorder">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><circle cx="5" cy="5" r="1"/><circle cx="5" cy="10" r="1"/><circle cx="5" cy="15" r="1"/><circle cx="10" cy="5" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="10" cy="15" r="1"/></svg>
                  </span>
                )}
                <div className="font-medium text-[var(--text)]">{role.name}</div>
              </div>

              {/* Description */}
              <div className="col-span-5">
                <div className="text-[var(--muted)] text-sm">
                  {role.description || 'No description'}
                </div>
              </div>

              {/* Created Date */}
              <div className="col-span-2">
                <div className="text-[var(--muted)] text-sm">
                  {role.createdAt ? formatUtcToLocal(role.createdAt) : '-'}
                </div>
              </div>

              {/* Status */}
              <div className="col-span-1 text-center">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  role.isActive ? 'bg-emerald-400' : 'bg-[var(--muted)]'
                }`} title={role.isActive ? 'Active' : 'Inactive'} />
              </div>

              {/* Actions */}
              <div className="col-span-1 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => onEditRole(role)}
                    className="text-[var(--muted)] hover:text-[var(--primary)] p-1 rounded transition-colors"
                    title="Edit role"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteRole(role)}
                    className="text-[var(--muted)] hover:text-red-400 p-1 rounded transition-colors"
                    title="Delete role"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/>
                      <path d="m19,6v14a2,2 0 0 1 -2,2H7a2,2 0 0 1 -2,-2V6m3,0V4a2,2 0 0 1 2,-2h4a2,2 0 0 1 2,2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default RoleList;
