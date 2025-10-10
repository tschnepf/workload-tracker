import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { authApi } from '@/services/api';

const ResetPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await authApi.requestPasswordReset(email.trim());
      setMsg('If an account exists for this email, a reset link has been sent.');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm bg-gray-800 p-6 rounded shadow">
        <h1 className="text-xl text-white mb-4">Reset Password</h1>
        {msg && <div className="bg-green-100 text-green-800 px-3 py-2 rounded mb-3">{msg}</div>}
        {error && <div className="bg-red-100 text-red-800 px-3 py-2 rounded mb-3">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
            autoComplete="email"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send Reset Link'}
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

export default ResetPassword;

