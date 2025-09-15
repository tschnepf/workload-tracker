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
}

const RoleList: React.FC<RoleListProps> = ({ 
  roles, 
  onEditRole, 
  onDeleteRole, 
  loading 
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
      className={`flex items-center gap-1 text-left hover:text-[#cccccc] transition-colors ${className}`}
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

  // Sort roles based on current sort settings
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
      <div className="text-[#969696] py-8 text-center">
        Loading roles...
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="text-[#969696] py-8 text-center">
        <div className="mb-2">No roles found</div>
        <div className="text-sm">Click "Add Role" to create your first role</div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="block sm:hidden space-y-2">
        {sortedRoles.map((role) => (
          <div key={role.id} className="bg-[#2d2d30] border border-[#3e3e42] rounded p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[#cccccc] font-medium">{role.name}</div>
                <div className="text-[#969696] text-xs mt-1">
                  {role.description || 'No description'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${role.isActive ? 'bg-emerald-400' : 'bg-[#969696]'}`} title={role.isActive ? 'Active' : 'Inactive'} />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditRole(role)}
                    className="text-[#969696] hover:text-[#007acc] p-1 rounded transition-colors"
                    aria-label={`Edit role ${role.name}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteRole(role)}
                    className="text-[#969696] hover:text-red-400 p-1 rounded transition-colors"
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
            <div className="text-[#969696] text-xs mt-2">
              Created: {role.createdAt ? formatUtcToLocal(role.createdAt) : '-'}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop/tablet: original table layout */}
      <div className="hidden sm:block overflow-x-auto">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-[#3e3e42]/30 border-b border-[#3e3e42] text-sm font-medium text-[#969696] rounded-t-md">
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
        <div className="divide-y divide-[#3e3e42]">
          {sortedRoles.map((role) => (
            <div
              key={role.id}
              className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-[#3e3e42]/20 transition-colors"
            >
              {/* Role Name */}
              <div className="col-span-3">
                <div className="font-medium text-[#cccccc]">{role.name}</div>
              </div>

              {/* Description */}
              <div className="col-span-5">
                <div className="text-[#969696] text-sm">
                  {role.description || 'No description'}
                </div>
              </div>

              {/* Created Date */}
              <div className="col-span-2">
                <div className="text-[#969696] text-sm">
                  {role.createdAt ? formatUtcToLocal(role.createdAt) : '-'}
                </div>
              </div>

              {/* Status */}
              <div className="col-span-1 text-center">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  role.isActive ? 'bg-emerald-400' : 'bg-[#969696]'
                }`} title={role.isActive ? 'Active' : 'Inactive'} />
              </div>

              {/* Actions */}
              <div className="col-span-1 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => onEditRole(role)}
                    className="text-[#969696] hover:text-[#007acc] p-1 rounded transition-colors"
                    title="Edit role"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteRole(role)}
                    className="text-[#969696] hover:text-red-400 p-1 rounded transition-colors"
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
