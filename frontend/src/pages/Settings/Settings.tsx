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

const Settings: React.FC = () => {
  const auth = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // People options (for admin create-user linking)
  const [peopleOptions, setPeopleOptions] = useState<Array<{ id: number; name: string }>>([]);
  // Create user (admin)
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPersonId, setNewUserPersonId] = useState<number | ''>('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [newUserRole, setNewUserRole] = useState<'admin' | 'manager' | 'user'>('user');
  // Users list (admin)
  const [users, setUsers] = useState<Array<{ id: number; username: string; email: string; role: 'admin'|'manager'|'user'; person: { id: number; name: string } | null }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMsg, setUsersMsg] = useState<string | null>(null);
  
  // Role management state
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);

  useEffect(() => {
    loadRoles();
    // Load people options (for admin create-user linking)
    (async () => {
      try {
        const list = await peopleApi.getForAutocomplete();
        setPeopleOptions(list.map(p => ({ id: p.id, name: p.name })));
      } catch (e) {
        // non-fatal
      }
    })();
    // Load users for admin
    (async () => {
      if (!auth.user?.is_staff) return;
      try {
        setUsersLoading(true);
        const data = await authApi.listUsers();
        setUsers(data);
      } catch (e) {
        // ignore; shown only for admins
      } finally {
        setUsersLoading(false);
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

          {/* (User Account section removed per feedback) */}
          
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

          {/* Admin: Create New User */}
          {auth.user?.is_staff && (
            <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold text-[#cccccc] mb-4">Create User (Admin)</h2>
              {createMsg && <div className="text-sm text-[#cccccc] mb-2">{createMsg}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[#969696] mb-1">Username</label>
                  <input className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-[#969696] mb-1">Email (optional)</label>
                  <input className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-[#969696] mb-1">Initial Password</label>
                  <input type="password" className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-[#969696] mb-1">Role</label>
                  <select className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2" value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)}>
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#969696] mb-1">Link to Person (optional)</label>
                  <select
                    className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2"
                    value={newUserPersonId}
                    onChange={(e) => setNewUserPersonId(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">— None —</option>
                    {peopleOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <button
                  disabled={createBusy}
                  onClick={async () => {
                    setCreateMsg(null);
                    if (!newUsername || !newUserPassword) {
                      setCreateMsg('Username and initial password are required.');
                      return;
                    }
                    setCreateBusy(true);
                    try {
                      await authApi.createUser({ username: newUsername.trim(), email: newEmail.trim(), password: newUserPassword, personId: newUserPersonId === '' ? null : Number(newUserPersonId), role: newUserRole });
                      setCreateMsg('User created successfully.');
                      setNewUsername(''); setNewEmail(''); setNewUserPassword(''); setNewUserPersonId('');
                      setNewUserRole('user');
                    } catch (err: any) {
                      setCreateMsg(err?.data?.detail || err?.message || 'Failed to create user');
                    } finally {
                      setCreateBusy(false);
                    }
                  }}
                  className="bg-[#007acc] hover:bg-[#005a9e] text-white px-4 py-2 rounded-md disabled:opacity-60"
                >
                  {createBusy ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </div>
          )}

          {auth.user?.is_staff && (
            <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold text-[#cccccc] mb-4">Users</h2>
              {usersLoading ? (
                <div className="text-[#cccccc]">Loading users…</div>
              ) : (
                <div className="overflow-auto">
                  {usersMsg && <div className="text-sm text-[#cccccc] mb-2">{usersMsg}</div>}
                  <table className="min-w-full text-sm text-left">
                    <thead className="text-[#969696]">
                      <tr>
                        <th className="py-2 pr-4">Username</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 pr-4">Linked Person</th>
                        <th className="py-2 pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#cccccc]">
                      {users.map(u => (
                        <tr key={u.id} className="border-t border-[#3e3e42]">
                          <td className="py-2 pr-4">{u.username}</td>
                          <td className="py-2 pr-4">{u.email}</td>
                          <td className="py-2 pr-4 capitalize">{u.role}</td>
                          <td className="py-2 pr-4">{u.person ? u.person.name : '—'}</td>
                          <td className="py-2 pr-4">
                            <button
                              className="text-red-400 hover:text-red-300 disabled:opacity-50"
                              disabled={u.id === auth.user?.id}
                              onClick={async () => {
                                setUsersMsg(null);
                                if (!confirm(`Delete user ${u.username}? This cannot be undone.`)) return;
                                try {
                                  await authApi.deleteUser(u.id);
                                  setUsers(prev => prev.filter(x => x.id !== u.id));
                                  setUsersMsg('User deleted.');
                                } catch (err: any) {
                                  setUsersMsg(err?.data?.detail || err?.message || 'Failed to delete user');
                                }
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
