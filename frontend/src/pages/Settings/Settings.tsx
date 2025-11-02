/**
 * Settings Page - Role management interface
 * Phase 2.2: Settings page with role management section
 */

import React, { useState, useEffect } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Loader from '@/components/ui/Loader';
import { Role } from '@/types/models';
import { rolesApi, peopleApi, authApi } from '@/services/api';
import Sidebar from '@/components/layout/Sidebar';
import RoleList from './components/RoleList';
import RoleForm from './components/RoleForm';
import RoleDeleteConfirm from './components/RoleDeleteConfirm';
import { useAuth } from '@/hooks/useAuth';
import BackupManagement from '@/components/settings/BackupManagement';
import RestoreManagement from '@/components/settings/RestoreManagement';
import BackupOverview from '@/components/settings/BackupOverview';
import UtilizationSchemeEditor from '@/components/settings/UtilizationSchemeEditor';
import { showToast } from '@/lib/toastBus';
import DepartmentProjectRolesSection from '@/components/settings/DepartmentProjectRolesSection';
import { useCapabilities } from '@/hooks/useCapabilities';
import PreDeliverablesBackfill from '@/components/settings/PreDeliverablesBackfill';
import ManualSnapshots from '@/components/settings/ManualSnapshots';

const Settings: React.FC = () => {
  const auth = useAuth();
  const caps = useCapabilities();
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
  const [users, setUsers] = useState<Array<{ id: number; username: string; email: string; role: 'admin'|'manager'|'user'; person: { id: number; name: string } | null; is_staff?: boolean; is_superuser?: boolean }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMsg, setUsersMsg] = useState<string | null>(null);
  // Invite user (admin)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin'|'manager'|'user'>('user');
  const [inviteBusy, setInviteBusy] = useState(false);
  // Admin audit logs
  const [audit, setAudit] = useState<Array<{ id: number; action: string; created_at: string; detail: any; actor?: { username?: string }; targetUser?: { username?: string } }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  
  // Role management state
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);

  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadRoles();
    // Load people options (for admin create-user linking)
    (async () => {
      try {
        const list = await peopleApi.autocomplete('', 50);
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
    // Load recent admin audit (invites/resets)
    (async () => {
      if (!auth.user?.is_staff) return;
      try {
        setAuditLoading(true);
        const logs = await authApi.listAdminAudit(100);
        setAudit(logs || []);
      } catch (e) {
        // quiet fail
      } finally {
        setAuditLoading(false);
      }
    })();
  }, [auth.accessToken, auth.user?.is_staff]);

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

  const handleReorderRoles = async (ids: number[]) => {
    try {
      await rolesApi.reorder(ids);
      showToast('Role order saved', 'success');
      await loadRoles();
    } catch (e: any) {
      showToast(e?.message || 'Failed to save order', 'error');
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
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <div className="py-10">
              <div className="max-w-md mx-auto">
                <Loader inline message="Loading settings..." />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Settings</h1>

          {/* (User Account section removed per feedback) */}
          
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {/* Quick section navigation */}
          <div className="mb-4 text-sm text-[var(--muted)]">
            Sections:
            <a href="#role-management" className="ml-2 text-[var(--text)] hover:text-[var(--text)]">Role Management</a>
            <span className="mx-2 text-[var(--border)]">|</span>
            <a href="#backup-restore" className="text-[var(--text)] hover:text-[var(--text)]">Backup &amp; Restore</a>
          </div>

          {/* Role Management Section */}
          <div id="role-management" className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-[var(--text)] mb-1">Role Management</h2>
                <p className="text-[var(--muted)] text-sm">
                  Manage job roles used throughout the system. Roles can be assigned to people and used for reporting.
                </p>
              </div>
              <Button onClick={handleCreateRole}>
                Add Role
              </Button>
            </div>

            <RoleList
              roles={roles}
              onEditRole={handleEditRole}
              onDeleteRole={handleDeleteRole}
              loading={loading}
              onReorder={auth.user?.is_staff ? handleReorderRoles : undefined}
            />
          </div>

          {/* Utilization Scheme (Admin editable; read-only for others) */}
          <div className="mt-6">
            <UtilizationSchemeEditor readOnly={!auth.user?.is_staff} />
          </div>

          {/* Department Project Roles (Admin + capability-gated) */}
          {auth.user?.is_staff && (
            <DepartmentProjectRolesSection
              enabled={!!((caps.data as any)?.projectRolesByDepartment)}
              isAdmin={!!auth.user?.is_staff}
            />
          )}

          {/* Admin: Pre‑Deliverables Backfill */}
          {auth.user?.is_staff && (
            <>
              <PreDeliverablesBackfill />
              <ManualSnapshots />
            </>
          )}

          {/* Admin: Create New User */}
          {auth.user?.is_staff && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold text-[var(--text)] mb-4">Create User (Admin)</h2>
              {createMsg && <div className="text-sm text-[var(--text)] mb-2">{createMsg}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input label="Username" autoComplete="username" value={newUsername} onChange={e => setNewUsername((e.target as HTMLInputElement).value)} />
                </div>
                <div>
                  <Input label="Email (optional)" type="email" autoComplete="email" value={newEmail} onChange={e => setNewEmail((e.target as HTMLInputElement).value)} />
                </div>
                <div>
                  <Input label="Initial Password" type="password" autoComplete="new-password" value={newUserPassword} onChange={e => setNewUserPassword((e.target as HTMLInputElement).value)} />
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted)] mb-1">Role</label>
                  <select className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[44px] focus:border-[var(--primary)]" value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)}>
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted)] mb-1">Link to Person (optional)</label>
                  <select
                    className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[44px] focus:border-[var(--primary)]"
                    value={newUserPersonId}
                    onChange={(e) => setNewUserPersonId(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">- None -</option>
                    {peopleOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <Button
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
                >
                  {createBusy ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </div>
          )}

          {auth.user?.is_staff && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold text-[var(--text)] mb-4">Users</h2>
              {/* Invite User */}
              <div className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input label="Invite Email" type="email" value={inviteEmail} onChange={e => setInviteEmail((e.target as HTMLInputElement).value)} />
                  <div>
                    <label className="block text-sm text-[var(--muted)] mb-1">Role</label>
                    <select className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[44px] focus:border-[var(--primary)]" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
                      <option value="user">User</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--muted)] mb-1">Link to Person (optional)</label>
                    <select
                      className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[44px] focus:border-[var(--primary)]"
                      value={newUserPersonId}
                      onChange={(e) => setNewUserPersonId(e.target.value === '' ? '' : Number(e.target.value))}
                    >
                      <option value="">- None -</option>
                      {peopleOptions.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      disabled={inviteBusy || !inviteEmail.trim()}
                      onClick={async () => {
                        setInviteBusy(true);
                        try {
                          const pid = newUserPersonId === '' ? null : Number(newUserPersonId);
                          await authApi.inviteUser({ email: inviteEmail.trim(), role: inviteRole, personId: pid });
                          showToast('Invite sent (if the email is valid).', 'success');
                          setInviteEmail('');
                          setInviteRole('user');
                          setNewUserPersonId('');
                        } catch (err: any) {
                          showToast(err?.data?.detail || err?.message || 'Failed to send invite', 'error');
                        } finally {
                          setInviteBusy(false);
                        }
                      }}
                    >
                      {inviteBusy ? 'Sending...' : 'Send Invite'}
                    </Button>
                  </div>
                </div>
                {/* Using toast for invite status */}
              </div>
              {usersLoading ? (
                <div className="text-[var(--text)]">Loading users...</div>
              ) : (
                <div>
                  {usersMsg && <div className="text-sm text-[var(--text)] mb-2">{usersMsg}</div>}
                  {/* Card list on small screens */}
                  <div className="block sm:hidden space-y-3">
                    {users.map(u => (
                      <div
                        key={u.id}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[var(--text)] font-medium text-base">{u.username}</div>
                            <div className="text-[var(--muted)] text-sm">{u.email || 'No email'}</div>
                          </div>
                          <select
                            className="text-xs px-2 py-1 rounded bg-[var(--card)] text-[var(--text)] border border-[var(--border)] capitalize min-h-[32px]"
                            value={u.role}
                            disabled={u.id === auth.user?.id}
                            onChange={async (e) => {
                              const nextRole = e.target.value as 'admin'|'manager'|'user';
                              if (nextRole === u.role) return;
                              if (u.id === auth.user?.id) return; // safeguard: cannot change own role
                              // Client-side guard: prevent removing the last admin
                              const adminCount = users.filter(x => x.role === 'admin' || x.is_staff || x.is_superuser).length;
                              if (u.role === 'admin' && nextRole !== 'admin' && adminCount <= 1) {
                                setUsersMsg('At least one admin must remain. Promote another user first.');
                                // Reset select to current value
                                (e.target as HTMLSelectElement).value = u.role;
                                return;
                              }
                              setUsersMsg(null);
                              try {
                                await authApi.setUserRole(u.id, nextRole);
                                setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: nextRole, is_staff: nextRole === 'admin' } : x));
                              } catch (err: any) {
                                setUsersMsg(err?.data?.detail || err?.message || 'Failed to update role');
                                // Reset select on failure
                                (e.target as HTMLSelectElement).value = u.role;
                              }
                            }}
                            aria-label={`Change role for ${u.username}`}
                          >
                            <option value="user">User</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div className="mt-2 text-sm text-[var(--muted)]">
                          <label className="block text-sm text-[var(--muted)] mb-1">Linked Person</label>
                          <select
                            className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[36px] focus:border-[var(--primary)]"
                            value={(u.person && u.person.id) || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              const pid = val === '' ? null : Number(val);
                              try {
                                const updated = await authApi.setUserPerson(u.id, pid);
                                setUsers(prev => prev.map(x => x.id === u.id ? { ...x, person: updated.person || null } : x));
                                showToast('Linked person updated', 'success');
                              } catch (err: any) {
                                showToast(err?.data?.detail || err?.message || 'Failed to link person', 'error');
                                // reset display
                                (e.target as HTMLSelectElement).value = (u.person && u.person.id) || '' as any;
                              }
                            }}
                          >
                            <option value="">- None -</option>
                            {peopleOptions.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-3 flex items-center gap-4">
                          <button
                            className={`inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md text-sm ${u.email ? 'text-blue-300 hover:text-blue-200 hover:bg-[var(--cardHover)]' : 'text-[var(--muted)]'} disabled:opacity-50`}
                            disabled={!u.email}
                            onClick={async () => {
                              if (!u.email) return;
                              setUsersMsg(null);
                              try {
                                await authApi.inviteUser({ email: u.email, username: u.username, role: u.role });
                                showToast('Invite sent.', 'success');
                              } catch (err: any) {
                                showToast(err?.data?.detail || err?.message || 'Failed to send invite', 'error');
                              }
                            }}
                          >
                            Resend Invite
                          </button>
                          <button
                            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md text-sm text-red-400 hover:text-red-300 hover:bg-[var(--cardHover)] disabled:opacity-50"
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
                            aria-disabled={u.id === auth.user?.id}
                            aria-label={`Delete user ${u.username}`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Table on sm and up */}
                  <div className="hidden sm:block overflow-auto">
                    <table className="min-w-full text-sm text-left">
                      <thead className="text-[var(--muted)]">
                        <tr>
                          <th className="py-2 pr-4">Username</th>
                          <th className="py-2 pr-4">Email</th>
                          <th className="py-2 pr-4">Role</th>
                          <th className="py-2 pr-4">Linked Person</th>
                          <th className="py-2 pr-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="text-[var(--text)]">
                        {users.map(u => (
                          <tr key={u.id} className="border-t border-[var(--border)]">
                            <td className="py-2 pr-4">{u.username}</td>
                            <td className="py-2 pr-4">{u.email}</td>
                            <td className="py-2 pr-4">
                              <select
                                className="text-sm px-2 py-1 rounded bg-[var(--card)] text-[var(--text)] border border-[var(--border)] capitalize min-h-[36px]"
                                value={u.role}
                                disabled={u.id === auth.user?.id}
                                onChange={async (e) => {
                                  const nextRole = e.target.value as 'admin'|'manager'|'user';
                                  if (nextRole === u.role) return;
                                  if (u.id === auth.user?.id) return; // cannot change own role
                                  const adminCount = users.filter(x => x.role === 'admin' || x.is_staff || x.is_superuser).length;
                                  if (u.role === 'admin' && nextRole !== 'admin' && adminCount <= 1) {
                                    setUsersMsg('At least one admin must remain. Promote another user first.');
                                    (e.target as HTMLSelectElement).value = u.role;
                                    return;
                                  }
                                  setUsersMsg(null);
                                  try {
                                    await authApi.setUserRole(u.id, nextRole);
                                    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: nextRole, is_staff: nextRole === 'admin' } : x));
                                  } catch (err: any) {
                                    setUsersMsg(err?.data?.detail || err?.message || 'Failed to update role');
                                    (e.target as HTMLSelectElement).value = u.role;
                                  }
                                }}
                                aria-label={`Change role for ${u.username}`}
                              >
                                <option value="user">User</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                            <td className="py-2 pr-4">
                              <select
                                className="text-sm px-2 py-1 rounded bg-[var(--card)] text-[var(--text)] border border-[var(--border)] min-h-[36px]"
                                value={(u.person && u.person.id) || ''}
                                onChange={async (e) => {
                                  const val = e.target.value;
                                  const pid = val === '' ? null : Number(val);
                                  try {
                                    const updated = await authApi.setUserPerson(u.id, pid);
                                    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, person: updated.person || null } : x));
                                    showToast('Linked person updated', 'success');
                                  } catch (err: any) {
                                    showToast(err?.data?.detail || err?.message || 'Failed to link person', 'error');
                                    (e.target as HTMLSelectElement).value = (u.person && u.person.id) || '' as any;
                                  }
                                }}
                                aria-label={`Change linked person for ${u.username}`}
                              >
                                <option value="">- None -</option>
                                {peopleOptions.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-4 space-x-4">
                              <button
                                className={`text-blue-300 hover:text-blue-200 hover:bg-[var(--surfaceHover)] rounded px-2 py-1 ${u.email ? '' : 'opacity-50 cursor-default'}`}
                                disabled={!u.email}
                                onClick={async () => {
                                  if (!u.email) return;
                                  setUsersMsg(null);
                              try {
                                    await authApi.inviteUser({ email: u.email, username: u.username, role: u.role });
                                    showToast('Invite sent.', 'success');
                                  } catch (err: any) {
                                    showToast(err?.data?.detail || err?.message || 'Failed to send invite', 'error');
                                  }
                                }}
                              >
                                Resend Invite
                              </button>
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
                </div>
              )}
            </div>
          )}

          {/* Admin-only: Backup & Restore Section */}
          {auth.user?.is_staff && (
            <div id="backup-restore" className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-[var(--text)] mb-1">Backup &amp; Restore</h2>
                <p className="text-[var(--muted)] text-sm">
                  Create and download database backups, and restore from existing or uploaded backups. Restoring will overwrite all current data.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6">
                <BackupOverview />
                <BackupManagement />
                <RestoreManagement />
              </div>
            </div>
          )}

          {/* Admin-only: Audit Log */}
          {auth.user?.is_staff && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-[var(--text)]">Admin Audit Log</h2>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setAuditLoading(true);
                      const logs = await authApi.listAdminAudit(100);
                      setAudit(logs || []);
                      showToast('Audit log refreshed', 'info');
                    } catch (e: any) {
                      showToast(e?.message || 'Failed to refresh audit log', 'error');
                    } finally {
                      setAuditLoading(false);
                    }
                  }}
                >
                  Refresh
                </Button>
              </div>
              {auditLoading ? (
                <div className="text-[var(--text)]">Loading...</div>
              ) : audit.length === 0 ? (
                <div className="text-[var(--muted)]">No recent events.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead className="text-[var(--muted)]">
                      <tr>
                        <th className="py-2 pr-4">Time</th>
                        <th className="py-2 pr-4">Actor</th>
                        <th className="py-2 pr-4">Action</th>
                        <th className="py-2 pr-4">Target</th>
                        <th className="py-2 pr-4">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text)]">
                      {audit.map((log) => (
                        <tr key={log.id} className="border-t border-[var(--border)]">
                          <td className="py-2 pr-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="py-2 pr-4">{log.actor?.username || '—'}</td>
                          <td className="py-2 pr-4">{log.action}</td>
                          <td className="py-2 pr-4">{log.targetUser?.username || '—'}</td>
                          <td className="py-2 pr-4">
                            <code className="text-xs">
                              {(() => { try { return JSON.stringify(log.detail || {}, null, 0); } catch { return String(log.detail || ''); } })()}
                            </code>
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
