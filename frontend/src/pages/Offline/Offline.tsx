import React from 'react';

const OfflinePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-6">
      <div className="w-full max-w-lg border border-[var(--border)] bg-[var(--card)] rounded-xl p-6">
        <h1 className="text-xl font-semibold mb-2">You are offline</h1>
        <p className="text-[var(--muted)]">
          Workload Tracker can open the app shell while offline, but live API data requires an internet connection.
          Reconnect and refresh to continue.
        </p>
      </div>
    </div>
  );
};

export default OfflinePage;
