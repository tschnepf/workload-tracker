import React from 'react';
import { Link } from 'react-router';

const ComingSoon: React.FC = () => {
  return (
    <main role="main" aria-labelledby="coming-soon-heading" className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 id="coming-soon-heading" className="text-3xl font-semibold mb-4">Help & Documentation</h1>
        <p className="text-[var(--color-text-secondary)] mb-6">
          We’re crafting helpful docs and tips for the Workload Tracker. This section is coming soon.
        </p>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center rounded-md bg-[var(--color-action-primary)] px-4 py-2 text-white hover:bg-[var(--color-action-primary-hover)]"
          >
            Back to Dashboard
          </Link>
          <a
            href="mailto:support@example.com"
            className="inline-flex items-center rounded-md border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] hover:border-[var(--color-border-subtle)]"
          >
            Contact Support
          </a>
        </div>
      </div>
    </main>
  );
};

export default ComingSoon;
