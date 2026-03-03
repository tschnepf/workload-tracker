import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { completeAzureSso } from '@/store/auth';

const SsoComplete: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Completing sign-in...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code = (searchParams.get('code') || '').trim();
      if (!code) {
        if (!cancelled) setMessage('Missing SSO completion code.');
        return;
      }
      try {
        await completeAzureSso(code);
        if (!cancelled) navigate('/', { replace: true });
      } catch (err: any) {
        const detail = err?.data?.detail || err?.message || 'Unable to complete SSO sign-in.';
        if (!cancelled) setMessage(detail);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md bg-gray-800 p-6 rounded shadow text-white">
        <h1 className="text-xl mb-2">Microsoft Sign-in</h1>
        <p className="text-sm text-gray-300">{message}</p>
      </div>
    </div>
  );
};

export default SsoComplete;
