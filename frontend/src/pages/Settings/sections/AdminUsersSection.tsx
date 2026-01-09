import React, { useCallback, useMemo, useState } from 'react';
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
  accountSetup?: boolean;
};

type PersonOption = {
  id: number;
  name: string;
  department?: number | null;
  departmentName?: string | null;
  roleName?: string | null;
};

export const ADMIN_USERS_SECTION_ID = 'admin-users';

const AdminUsersSection: React.FC = () => {
  const { auth } = useSettingsData();
  const isAdmin = !!auth.user?.is_staff;

  const [peopleOptions, setPeopleOptions] = useState<PersonOption[]>([]);
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
  const [usersFilter, setUsersFilter] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'user'>('user');
  const [invitePersonId, setInvitePersonId] = useState<number | ''>('');
  const [inviteBusy, setInviteBusy] = useState(false);

  const loadPeopleOptions = useCallback(async () => {
    try {
      const list = await peopleApi.listAll();
      const options = list
        .filter(p => typeof p.id === 'number')
        .map(p => ({
          id: p.id as number,
          name: p.name,
          department: p.department ?? null,
          departmentName: p.departmentName ?? null,
          roleName: p.roleName ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      setPeopleOptions(options);
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
      await authApi.inviteUser({
        email: inviteEmail,
        role: inviteRole,
        personId: typeof invitePersonId === 'number' ? invitePersonId : undefined,
      });
      setInviteEmail('');
      setInviteRole('user');
      setInvitePersonId('');
      setUsersMsg('Invite sent.');
      void loadUsers();
    } catch (err: any) {
      setUsersMsg(err?.data?.detail || err?.message || 'Failed to send invite');
    } finally {
      setInviteBusy(false);
    }
  };

  const adminCount = users.filter(x => x.role === 'admin' || x.is_staff || x.is_superuser).length;
  const peopleById = useMemo(() => new Map(peopleOptions.map(p => [p.id, p])), [peopleOptions]);

  const normalizeSortText = (value?: string | null) => (value || '').trim();
  const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const compareNullableText = (a?: string | null, b?: string | null) => {
    const aVal = normalizeSortText(a);
    const bVal = normalizeSortText(b);
    if (!aVal && bVal) return 1;
    if (aVal && !bVal) return -1;
    return compareText(aVal, bVal);
  };

  const { assignedUsers, unassignedUsers } = useMemo(() => {
    const query = usersFilter.trim().toLowerCase();
    const tokens = query ? query.split(/\s+/).filter(Boolean) : [];
    const matchesFilter = (user: AdminUser) => {
      if (tokens.length === 0) return true;
      const personMeta = user.person?.id ? peopleById.get(user.person.id) : null;
      const haystack = [
        user.username,
        user.email,
        user.role,
        user.person?.name,
        personMeta?.name,
        personMeta?.roleName,
        personMeta?.departmentName,
      ]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());
      return tokens.every(token => haystack.some(value => value.includes(token)));
    };
    const assigned: AdminUser[] = [];
    const unassigned: AdminUser[] = [];
    for (const user of users) {
      if (!matchesFilter(user)) continue;
      if (user.person && user.person.id) {
        assigned.push(user);
      } else {
        unassigned.push(user);
      }
    }
    const sortUsers = (list: AdminUser[]) => {
      const copy = [...list];
      copy.sort((a, b) => {
        const aPerson = a.person?.id ? peopleById.get(a.person.id) : null;
        const bPerson = b.person?.id ? peopleById.get(b.person.id) : null;
        const nameCmp = compareNullableText(aPerson?.name || a.person?.name, bPerson?.name || b.person?.name);
        if (nameCmp !== 0) return nameCmp;
        const roleCmp = compareNullableText(aPerson?.roleName, bPerson?.roleName);
        if (roleCmp !== 0) return roleCmp;
        const usernameCmp = compareNullableText(a.username, b.username);
        if (usernameCmp !== 0) return usernameCmp;
        const emailCmp = compareNullableText(a.email, b.email);
        if (emailCmp !== 0) return emailCmp;
        const deptCmp = compareNullableText(aPerson?.departmentName, bPerson?.departmentName);
        if (deptCmp !== 0) return deptCmp;
        return a.id - b.id;
      });
      return copy;
    };
    return {
      assignedUsers: sortUsers(assigned),
      unassignedUsers: sortUsers(unassigned),
    };
  }, [users, peopleById, usersFilter]);

  const userTableColumnWidths = [
    '240px', // Linked Person
    '180px', // Person Role
    '160px', // Username
    '300px', // Email
    '160px', // Department
    '140px', // User Role
    '170px', // Account Status
    '180px', // Actions
  ];

  const renderUsersTable = (list: AdminUser[]) => (
    <div className="overflow-auto">
      <table className="min-w-full text-sm text-left whitespace-nowrap table-fixed">
        <colgroup>
          {userTableColumnWidths.map((width, idx) => (
            <col key={width + idx} style={{ width }} />
          ))}
        </colgroup>
        <thead className="text-[var(--muted)]">
          <tr>
            <th className="py-2 pr-4">Linked Person</th>
            <th className="py-2 pr-4">Person Role</th>
            <th className="py-2 pr-4">Username</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Department</th>
            <th className="py-2 pr-4">User Role</th>
            <th className="py-2 pr-4">Account Status</th>
            <th className="py-2 pr-4">Actions</th>
          </tr>
        </thead>
        <tbody className="text-[var(--text)]">
          {list.map((u) => {
            const personMeta = u.person?.id ? peopleById.get(u.person.id) : null;
            const accountSetup = u.accountSetup ?? true;
            return (
              <tr key={u.id} className="border-t border-[var(--border)]">
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
                <td className="py-2 pr-4">{personMeta?.roleName || '-'}</td>
                <td className="py-2 pr-4">{u.username}</td>
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{personMeta?.departmentName || '-'}</td>
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
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      accountSetup
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {accountSetup ? 'Active' : 'Invite pending'}
                  </span>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              value={invitePersonId}
              onChange={(e) => setInvitePersonId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">- None -</option>
              {peopleOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
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
        <div className="mb-4">
          <Input
            label="Search users"
            value={usersFilter}
            onChange={e => setUsersFilter((e.target as HTMLInputElement).value)}
            placeholder="Name, email, role, or department"
            autoComplete="off"
          />
        </div>
        {usersMsg && <div className="text-sm text-[var(--text)] mb-2">{usersMsg}</div>}
        {usersLoading ? (
          <div className="text-[var(--text)]">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="text-[var(--muted)]">No users found.</div>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-[var(--text)] font-semibold mb-2">Assigned to Person ({assignedUsers.length})</h4>
              {assignedUsers.length === 0 ? (
                <div className="text-[var(--muted)]">No users are assigned to a person yet.</div>
              ) : (
                renderUsersTable(assignedUsers)
              )}
            </div>
            <div>
              <h4 className="text-[var(--text)] font-semibold mb-2">Not Assigned ({unassignedUsers.length})</h4>
              {unassignedUsers.length === 0 ? (
                <div className="text-[var(--muted)]">All users are assigned to a person.</div>
              ) : (
                renderUsersTable(unassignedUsers)
              )}
            </div>
          </div>
        )}
      </div>
    </SettingsSectionFrame>
  );
};

export default AdminUsersSection;
