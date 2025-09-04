/**
 * Settings Page - Role management interface
 * Phase 2.2: Settings page with role management section
 */

import React, { useState, useEffect } from 'react';
import { Role } from '@/types/models';
import { rolesApi, peopleApi, authApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import RoleList from './components/RoleList';
import RoleForm from './components/RoleForm';
import RoleDeleteConfirm from './components/RoleDeleteConfirm';
import { useAuth } from '@/hooks/useAuth';
import { reloadProfile } from '@/store/auth';

const Settings: React.FC = () => {
  const auth = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Person linking state
  const [peopleOptions, setPeopleOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<number | ''>(auth.person?.id ?? '');
  const [linkBusy, setLinkBusy] = useState(false);
  
  // Role management state
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);

  useEffect(() => {
    loadRoles();
    // Load people options for linking
    (async () => {
      try {
        const list = await peopleApi.getForAutocomplete();
        setPeopleOptions(list.map(p => ({ id: p.id, name: p.name })));
      } catch (e) {
        // non-fatal
      }
    })();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      const rolesList = await rolesApi.list();
      setRoles(rolesList.results || []);
    } catch (err: any) {
      setError(`Failed to load roles: ${err.message}`);
      console.error('Error loading roles:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setShowRoleForm(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setShowRoleForm(true);
  };

  const handleDeleteRole = (role: Role) => {
    setDeletingRole(role);
  };

  const handleRoleFormClose = () => {
    setShowRoleForm(false);
    setEditingRole(null);
  };

  const handleRoleFormSave = () => {
    setShowRoleForm(false);
    setEditingRole(null);
    loadRoles(); // Refresh the list
  };

  const handleDeleteConfirm = () => {
    setDeletingRole(null);
    loadRoles(); // Refresh the list
  };

  const handleDeleteCancel = () => {
    setDeletingRole(null);
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-6">
          <div className="text-[#cccccc]">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-[#cccccc] mb-6">Settings</h1>

          {/* User Account Section */}
          <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#cccccc] mb-4">User Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-sm text-[#969696] mb-1">Link to Person</label>
                <select
                  className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2"
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">— None (Unlink) —</option>
                  {peopleOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-xs text-[#969696] mt-1">Current: {auth.person?.name || 'None'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={linkBusy}
                  onClick={async () => {
                    setLinkBusy(true);
                    setError(null);
                    try {
                      await authApi.linkPerson(selectedPersonId === '' ? null : Number(selectedPersonId));
                      await reloadProfile();
                    } catch (err: any) {
                      const msg = err?.response?.detail || err?.message || 'Failed to update link';
                      setError(msg);
                    } finally {
                      setLinkBusy(false);
                    }
                  }}
                  className="bg-[#007acc] hover:bg-[#005a9e] text-white px-4 py-2 rounded-md disabled:opacity-60"
                >
                  {linkBusy ? 'Saving…' : 'Save Link'}
                </button>
              </div>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {/* Role Management Section */}
          <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-[#cccccc] mb-1">Role Management</h2>
                <p className="text-[#969696] text-sm">
                  Manage job roles used throughout the system. Roles can be assigned to people and used for reporting.
                </p>
              </div>
              <button
                onClick={handleCreateRole}
                className="bg-[#007acc] hover:bg-[#005a9e] text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                Add Role
              </button>
            </div>

            <RoleList
              roles={roles}
              onEditRole={handleEditRole}
              onDeleteRole={handleDeleteRole}
              loading={loading}
            />
          </div>
        </div>

        {/* Role Form Modal */}
        {showRoleForm && (
          <RoleForm
            role={editingRole}
            onSave={handleRoleFormSave}
            onCancel={handleRoleFormClose}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deletingRole && (
          <RoleDeleteConfirm
            role={deletingRole}
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
          />
        )}
      </div>
    </div>
  );
};

export default Settings;
