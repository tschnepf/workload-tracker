import React from 'react';

type AuthLayoutProps = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
};

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => {
  const [logoError, setLogoError] = React.useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] relative overflow-hidden">
      {/* Soft brand gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(50% 50% at 50% 50%, var(--primary) 0%, transparent 70%)',
          filter: 'blur(80px)'
        }}
      />
      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6">
          <div className="flex flex-col items-center text-center mb-4">
            {!logoError ? (
              <img
                src="/brand/SMC-TRIANGLE.png"
                alt="Brand"
                className="w-12 h-12 mb-2 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-12 h-12 mb-2 rounded bg-[var(--primary)] flex items-center justify-center">
                <span className="text-white text-sm font-bold">WT</span>
              </div>
            )}
            {title && <h1 className="text-lg font-semibold text-[var(--text)]">{title}</h1>}
            {subtitle && <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;

