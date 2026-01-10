import React, { useCallback, useState } from 'react';
import Button from '@/components/ui/Button';
import RoleList from '@/pages/Settings/components/RoleList';
import RoleForm from '@/pages/Settings/components/RoleForm';
import RoleDeleteConfirm from '@/pages/Settings/components/RoleDeleteConfirm';
import { rolesApi } from '@/services/api';
import type { Role } from '@/types/models';
import { showToast } from '@/lib/toastBus';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useSettingsData } from '../SettingsDataContext';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { isAdminOrManager } from '@/utils/roleAccess';

export const ROLE_MANAGEMENT_SECTION_ID = 'role-management';

const RoleManagementSection: React.FC = () => {
  const { auth } = useSettingsData();
  const canReorder = isAdminOrManager(auth.user);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);

  const loadRoles = useCallback(async () => {
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
  }, []);

  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadRoles();
  }, [auth.accessToken, loadRoles]);

  const refreshRolesQuietly = useCallback(async () => {
    try {
      const page = await rolesApi.list();
      setRoles(page.results || []);
    } catch {
      // ignore
    }
  }, []);

  const handleCreateRole = () => {
    setEditingRole(null);
    setShowRoleForm(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setShowRoleForm(true);
  };

  const handleRoleFormSave = () => {
    setShowRoleForm(false);
    setEditingRole(null);
    void loadRoles();
  };

  const handleDeleteRole = (role: Role) => setDeletingRole(role);
  const handleDeleteConfirm = () => {
    setDeletingRole(null);
    void loadRoles();
  };

  const handleReorderRoles = async (ids: number[]) => {
    setRoles(prev => {
      const map = new Map(prev.map(r => [r.id, r] as const));
      const ordered = ids.map(id => map.get(id)).filter(Boolean) as Role[];
      const missing = prev.filter(r => !ids.includes(r.id));
      return [...ordered, ...missing];
    });
    try {
      await rolesApi.reorder(ids);
      showToast('Role order saved', 'success');
      void refreshRolesQuietly();
    } catch (e: any) {
      showToast(e?.message || 'Failed to save order', 'error');
      void refreshRolesQuietly();
    }
  };

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setReorderMode(v => !v)}
        className={`px-3 py-2 rounded text-sm border ${
          reorderMode
            ? 'text-white bg-[var(--primary)] border-[var(--primary)]'
            : 'text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
        }`}
      >
        {reorderMode ? 'Done Reordering' : 'Reorder'}
      </button>
      <Button type="button" onClick={handleCreateRole}>
        Add Role
      </Button>
    </div>
  );

  return (
    <SettingsSectionFrame
      id={ROLE_MANAGEMENT_SECTION_ID}
      title="Role Management"
      description="Manage job roles used throughout the system. Roles can be assigned to people and used for reporting."
      actions={actions}
    >
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      <RoleList
        roles={roles}
        onEditRole={handleEditRole}
        onDeleteRole={handleDeleteRole}
        loading={loading}
        onReorder={canReorder && reorderMode ? handleReorderRoles : undefined}
      />

      {showRoleForm && (
        <RoleForm
          role={editingRole}
          onSave={handleRoleFormSave}
          onCancel={() => {
            setShowRoleForm(false);
            setEditingRole(null);
          }}
        />
      )}

      {deletingRole && (
        <RoleDeleteConfirm
          role={deletingRole}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingRole(null)}
        />
      )}
    </SettingsSectionFrame>
  );
};

export default RoleManagementSection;
