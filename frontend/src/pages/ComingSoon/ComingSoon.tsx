import React from 'react';
import { Link } from 'react-router';

const ComingSoon: React.FC = () => {
  return (
    <main role="main" aria-labelledby="coming-soon-heading" className="min-h-screen bg-[#1e1e1e] text-[#cccccc]">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 id="coming-soon-heading" className="text-3xl font-semibold mb-4">Help & Documentation</h1>
        <p className="text-[#969696] mb-6">
          We’re crafting helpful docs and tips for the Workload Tracker. This section is coming soon.
        </p>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center bg-[#007acc] hover:bg-[#005a9e] text-white px-4 py-2 rounded-md"
          >
            Back to Dashboard
          </Link>
          <a
            href="mailto:support@example.com"
            className="inline-flex items-center border border-[#3e3e42] hover:border-[#5a5a5f] text-[#cccccc] px-4 py-2 rounded-md"
          >
            Contact Support
          </a>
        </div>
      </div>
    </main>
  );
};

export default ComingSoon;


