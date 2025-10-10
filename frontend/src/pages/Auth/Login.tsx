import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { login } from '@/store/auth';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location?.state?.from?.pathname || '/';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err: any) {
      const message = err?.data?.detail || err?.message || 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm bg-gray-800 p-6 rounded shadow">
        <h1 className="text-xl text-white mb-4">Sign in</h1>
        {error && <div className="bg-red-100 text-red-800 px-3 py-2 rounded mb-3">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Username or Email</label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded bg-gray-700 text-white outline-none border border-gray-600 focus:border-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 rounded bg-gray-700 text-white outline-none border border-gray-600 focus:border-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="text-right mt-2">
            <a href="/reset-password" className="text-sm text-blue-300 hover:text-blue-200">Forgot password?</a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;


