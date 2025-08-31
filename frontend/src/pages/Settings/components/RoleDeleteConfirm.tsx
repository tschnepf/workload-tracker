/**
 * RoleDeleteConfirm Component - Confirmation dialog for role deletion
 * Phase 2.3: Safe role deletion with usage validation
 */

import React, { useState, useEffect } from 'react';
import { Role } from '@/types/models';
import { rolesApi } from '@/services/api';

interface RoleDeleteConfirmProps {
  role: Role;
  onConfirm: () => void;
  onCancel: () => void;
}

const RoleDeleteConfirm: React.FC<RoleDeleteConfirmProps> = ({ 
  role, 
  onConfirm, 
  onCancel 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(0);

  useEffect(() => {
    // In a real implementation, you'd fetch the count of people using this role
    // For now, we'll simulate this (the backend already handles this validation)
    setPeopleCount(0);
  }, [role.id]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await rolesApi.delete(role.id);
      onConfirm();
    } catch (err: any) {
      // The backend will return a proper error if the role is in use
      if (err.message?.includes('assigned to') || err.status === 400) {
        setError(err.message || 'Cannot delete role because it is assigned to people.');
      } else {
        setError(`Failed to delete role: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg w-full max-w-md mx-4">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[#cccccc]">Delete Role</h2>
          </div>

          <div className="mb-6">
            <p className="text-[#cccccc] mb-2">
              Are you sure you want to delete the role <span className="font-semibold text-red-400">"{role.name}"</span>?
            </p>
            <p className="text-[#969696] text-sm">
              This action cannot be undone. If this role is currently assigned to any people, 
              the deletion will be prevented.
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Role Details */}
          <div className="mb-6 p-4 bg-[#3e3e42]/30 rounded border border-[#3e3e42]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#cccccc]">Role Name:</span>
              <span className="text-sm text-[#cccccc]">{role.name}</span>
            </div>
            {role.description && (
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-[#cccccc] mr-3">Description:</span>
                <span className="text-sm text-[#969696] text-right flex-1">{role.description}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#cccccc]">Status:</span>
              <span className={`text-sm ${role.isActive ? 'text-emerald-400' : 'text-[#969696]'}`}>
                {role.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {/* Warning Message */}
          <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m21,16l-6.37-11a1.13,1.13 0 0 0 -1.94,0L6.32,16a1.11,1.11 0 0 0 0.97,1.69h12.74A1.11,1.11 0 0 0 21.03,16Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div className="text-sm text-amber-400">
                <div className="font-medium mb-1">Deletion Safety Check</div>
                <div>
                  The system will prevent deletion if this role is currently assigned to any people. 
                  You'll need to reassign those people to other roles first.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-[#3e3e42] flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-[#969696] border border-[#3e3e42] rounded hover:bg-[#3e3e42]/50 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete Role'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleDeleteConfirm;