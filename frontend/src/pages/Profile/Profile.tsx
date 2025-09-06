import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authApi, peopleApi } from '@/services/api';

const Profile: React.FC = () => {
  const auth = useAuth();
  const [personName, setPersonName] = useState('');
  const [personDept, setPersonDept] = useState<string>('—');
  const [personRole, setPersonRole] = useState<string>('—');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const accountRole = useMemo(() => auth.user?.accountRole || (auth.user?.is_staff || auth.user?.is_superuser ? 'admin' : 'user'), [auth.user]);

  useEffect(() => {
    const pid = auth.person?.id;
    if (!pid) {
      setPersonName('');
      setPersonDept('—');
      setPersonRole('—');
      return;
    }
    (async () => {
      try {
        const p = await peopleApi.get(pid);
        setPersonName(p.name || '');
        setPersonDept((p as any).departmentName || '—');
        setPersonRole((p as any).roleName || '—');
      } catch {
        // ignore
      }
    })();
  }, [auth.person?.id]);

  const canEditName = !!auth.person?.id;

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-[#cccccc] mb-6">My Profile</h1>

        <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#969696] mb-1">Username</label>
              <div className="text-[#cccccc]">{auth.user?.username || '—'}</div>
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">Email</label>
              <div className="text-[#cccccc]">{auth.user?.email || '—'}</div>
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">Account Role</label>
              <div className="text-[#cccccc] capitalize">{accountRole}</div>
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">Assigned Department</label>
              <div className="text-[#cccccc]">{personDept}</div>
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">Person Role</label>
              <div className="text-[#cccccc]">{personRole}</div>
            </div>
          </div>
        </div>

        <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#cccccc] mb-4">Name</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <input
                type="text"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                disabled={!canEditName}
                className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2 disabled:opacity-60"
                placeholder={canEditName ? 'Enter your name' : 'No linked person'}
              />
            </div>
            <div>
              <button
                disabled={!canEditName || savingName}
                onClick={async () => {
                  if (!auth.person?.id) return;
                  setNameMsg(null);
                  setSavingName(true);
                  try {
                    await peopleApi.update(auth.person.id, { name: personName });
                    setNameMsg('Name updated.');
                  } catch (err: any) {
                    setNameMsg(err?.message || 'Failed to update name');
                  } finally {
                    setSavingName(false);
                  }
                }}
                className="bg-[#007acc] hover:bg-[#005a9e] text-white px-4 py-2 rounded-md disabled:opacity-60"
              >
                {savingName ? 'Saving…' : 'Save Name'}
              </button>
            </div>
          </div>
          {nameMsg && <div className="text-sm text-[#cccccc] mt-2">{nameMsg}</div>}
        </div>

        <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[#cccccc] mb-4">Change Password</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm text-[#969696] mb-1">Current Password</label>
              <input type="password" className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">New Password</label>
              <input type="password" className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">Confirm New Password</label>
              <input type="password" className="w-full bg-[#1f1f1f] border border-[#3e3e42] text-[#cccccc] rounded px-3 py-2" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            {pwMsg && <div className="text-sm text-[#cccccc] mb-2">{pwMsg}</div>}
            <button
              disabled={pwBusy}
              onClick={async () => {
                setPwMsg(null);
                if (!currentPw || !newPw || newPw !== confirmPw) {
                  setPwMsg('Please enter current password and matching new passwords.');
                  return;
                }
                setPwBusy(true);
                try {
                  await authApi.changePassword(currentPw, newPw);
                  setPwMsg('Password changed successfully.');
                  setCurrentPw(''); setNewPw(''); setConfirmPw('');
                } catch (err: any) {
                  setPwMsg(err?.data?.detail || err?.message || 'Failed to change password');
                } finally {
                  setPwBusy(false);
                }
              }}
              className="bg-[#007acc] hover:bg-[#005a9e] text-white px-4 py-2 rounded-md disabled:opacity-60"
            >
              {pwBusy ? 'Changing…' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

