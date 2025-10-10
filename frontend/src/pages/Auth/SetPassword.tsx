import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { authApi } from '@/services/api';

const SetPassword: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const uid = qs.get('uid') || '';
  const token = qs.get('token') || '';
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = !!uid && !!token && pw1.length > 0 && pw1 === pw2;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await authApi.confirmPasswordReset(uid, token, pw1);
      setMsg('Password set. You can now sign in.');
      setTimeout(() => navigate('/login', { replace: true }), 800);
    } catch (err: any) {
      setError(err?.data?.detail || err?.message || 'Failed to set password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm bg-gray-800 p-6 rounded shadow">
        <h1 className="text-xl text-white mb-4">Set Password</h1>
        {!uid || !token ? (
          <div className="bg-red-100 text-red-800 px-3 py-2 rounded mb-3">Invalid or missing token.</div>
        ) : null}
        {msg && <div className="bg-green-100 text-green-800 px-3 py-2 rounded mb-3">{msg}</div>}
        {error && (
          <div className="bg-red-100 text-red-800 px-3 py-2 rounded mb-3">
            {error}
            <div className="mt-2">
              <a href="/reset-password" className="text-blue-700 underline">Request a new reset link</a>
            </div>
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="New Password"
            type="password"
            value={pw1}
            onChange={(e) => setPw1((e.target as HTMLInputElement).value)}
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirm Password"
            type="password"
            value={pw2}
            onChange={(e) => setPw2((e.target as HTMLInputElement).value)}
            autoComplete="new-password"
            required
          />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy || !valid}>
              {busy ? 'Saving…' : 'Set Password'}
            </Button>
            <button
              type="button"
              className="text-sm text-blue-300 hover:text-blue-200"
              onClick={() => navigate('/login')}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetPassword;
