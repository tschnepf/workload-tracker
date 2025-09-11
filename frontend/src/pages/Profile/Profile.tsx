import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { authApi, peopleApi } from '@/services/api';
import { useUpdatePerson } from '@/hooks/usePeople';
import Toast from '@/components/ui/Toast';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const updatePersonMutation = useUpdatePerson();
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
    <>
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
              <Input
                type="text"
                autoComplete="name"
                value={personName}
                onChange={(e) => setPersonName((e.target as HTMLInputElement).value)}
                disabled={!canEditName}
                placeholder={canEditName ? 'Enter your name' : 'No linked person'}
              />
            </div>
            <div>
              <Button
                disabled={!canEditName || savingName}
                onClick={async () => {
                  if (!auth.person?.id) return;
                  setNameMsg(null);
                  setSavingName(true);
                  try {
                    await updatePersonMutation.mutateAsync({ id: auth.person.id, data: { name: personName } });
                    setNameMsg('Name updated.');
                    setToast({ message: 'Profile name updated', type: 'success' });
                  } catch (err: any) {
                    setNameMsg(err?.message || 'Failed to update name');
                    setToast({ message: 'Failed to update profile name', type: 'error' });
                  } finally {
                    setSavingName(false);
                  }
                }}
              >
                {savingName ? 'Saving…' : 'Save Name'}
              </Button>
            </div>
          </div>
          {nameMsg && <div className="text-sm text-[#cccccc] mt-2">{nameMsg}</div>}
        </div>

        <div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[#cccccc] mb-4">Change Password</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm text-[#969696] mb-1">Current Password</label>
              <Input type="password" autoComplete="current-password" value={currentPw} onChange={e => setCurrentPw((e.target as HTMLInputElement).value)} />
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">New Password</label>
              <Input type="password" autoComplete="new-password" value={newPw} onChange={e => setNewPw((e.target as HTMLInputElement).value)} />
            </div>
            <div>
              <label className="block text-sm text-[#969696] mb-1">Confirm New Password</label>
              <Input type="password" autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw((e.target as HTMLInputElement).value)} />
            </div>
          </div>
          <div className="mt-3">
            {pwMsg && <div className="text-sm text-[#cccccc] mb-2">{pwMsg}</div>}
            <Button
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
            >
              {pwBusy ? 'Changing…' : 'Change Password'}
            </Button>
          </div>
        </div>
      </div>
    </div>
    {toast && (
      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
    )}
  </>
  );
};

export default Profile;


