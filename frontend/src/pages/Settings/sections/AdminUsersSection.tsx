import React, { useCallback, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { peopleApi, authApi } from '@/services/api';
import { useSettingsData } from '../SettingsDataContext';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { showToast } from '@/lib/toastBus';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

type AdminUser = {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  person: { id: number; name: string } | null;
  is_staff?: boolean;
  is_superuser?: boolean;
};

export const ADMIN_USERS_SECTION_ID = 'admin-users';

const AdminUsersSection: React.FC = () => {
  const { auth } = useSettingsData();
  const isAdmin = !!auth.user?.is_staff;

  const [peopleOptions, setPeopleOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPersonId, setNewUserPersonId] = useState<number | ''>('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [newUserRole, setNewUserRole] = useState<'admin' | 'manager' | 'user'>('user');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMsg, setUsersMsg] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'user'>('user');
  const [inviteBusy, setInviteBusy] = useState(false);

  const loadPeopleOptions = useCallback(async () => {
    try {
      const list = await peopleApi.autocomplete('', 50);
      setPeopleOptions(list.map(p => ({ id: p.id, name: p.name })));
    } catch {
      // ignore
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setUsersLoading(true);
      const data = await authApi.listUsers();
      setUsers(data);
    } catch {
      // ignore; admin-only table
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin]);

  useAuthenticatedEffect(() => {
    if (!auth.accessToken || !isAdmin) return;
    void loadPeopleOptions();
    void loadUsers();
  }, [auth.accessToken, isAdmin, loadPeopleOptions, loadUsers]);

  if (!isAdmin) return null;

  const resetCreateForm = () => {
    setNewUsername('');
    setNewEmail('');
    setNewUserPassword('');
    setNewUserPersonId('');
    setNewUserRole('user');
  };

  const handleCreateUser = async () => {
    setCreateMsg(null);
    if (!newUsername || !newUserPassword) {
      setCreateMsg('Username and password are required');
      return;
    }
    try {
      setCreateBusy(true);
      await authApi.createUser({
        username: newUsername,
        email: newEmail || undefined,
        password: newUserPassword,
        role: newUserRole,
        personId: typeof newUserPersonId === 'number' ? newUserPersonId : undefined,
      });
      setCreateMsg('User created successfully');
      resetCreateForm();
      void loadUsers();
    } catch (e: any) {
      setCreateMsg(e?.data?.detail || e?.message || 'Failed to create user');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) {
      setUsersMsg('Email is required to send an invite.');
      return;
    }
    try {
      setInviteBusy(true);
      setUsersMsg(null);
      await authApi.inviteUser({ email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      setInviteRole('user');
      setUsersMsg('Invite sent.');
    } catch (err: any) {
      setUsersMsg(err?.data?.detail || err?.message || 'Failed to send invite');
    } finally {
      setInviteBusy(false);
    }
  };

  const adminCount = users.filter(x => x.role === 'admin' || x.is_staff || x.is_superuser).length;

  return (
    <SettingsSectionFrame
      id={ADMIN_USERS_SECTION_ID}
      title="User Management"
      description="Create new users, manage invites, and adjust existing roles."
      className="mt-6"
    >
      {createMsg && <div className="text-sm text-[var(--text)] mb-2">{createMsg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Username" autoComplete="username" value={newUsername} onChange={e => setNewUsername((e.target as HTMLInputElement).value)} />
        <Input label="Email (optional)" type="email" autoComplete="email" value={newEmail} onChange={e => setNewEmail((e.target as HTMLInputElement).value)} />
        <Input label="Initial Password" type="password" autoComplete="new-password" value={newUserPassword} onChange={e => setNewUserPassword((e.target as HTMLInputElement).value)} />
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
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={createBusy} onClick={handleCreateUser}>
          {createBusy ? 'Creating...' : 'Create User'}
        </Button>
        <Button variant="secondary" onClick={resetCreateForm} disabled={createBusy}>
          Reset
        </Button>
      </div>

      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <h3 className="text-lg font-semibold text-[var(--text)] mb-2">Send Invite</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Invite Email" type="email" value={inviteEmail} onChange={e => setInviteEmail((e.target as HTMLInputElement).value)} />
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">Role</label>
            <select className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[44px] focus:border-[var(--primary)]" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button disabled={inviteBusy} onClick={handleInvite} className="w-full">
              {inviteBusy ? 'Sending…' : 'Send Invite'}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-[var(--text)]">Users</h3>
          <Button variant="secondary" onClick={() => void loadUsers()}>
            Refresh
          </Button>
        </div>
        {usersMsg && <div className="text-sm text-[var(--text)] mb-2">{usersMsg}</div>}
        {usersLoading ? (
          <div className="text-[var(--text)]">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="text-[var(--muted)]">No users found.</div>
        ) : (
          <div className="overflow-auto">
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
                {users.map((u) => (
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
                          if (u.id === auth.user?.id) return;
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
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-2 py-1"
                        onClick={async () => {
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
    </SettingsSectionFrame>
  );
};

export default AdminUsersSection;
