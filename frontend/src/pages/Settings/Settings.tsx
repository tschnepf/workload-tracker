/**
 * Settings Page - Role management interface
 * Phase 2.2: Settings page with role management section
 */

import React, { useState, useEffect } from 'react';
import { Role } from '@/types/models';
import { rolesApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import RoleList from './components/RoleList';
import RoleForm from './components/RoleForm';
import RoleDeleteConfirm from './components/RoleDeleteConfirm';

const Settings: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Role management state
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);

  useEffect(() => {
    loadRoles();
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