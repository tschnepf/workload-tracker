import React from 'react';

interface Props {
  message: string;
}

const ErrorBanner: React.FC<Props> = ({ message }) => {
  if (!message) return null as any;
  return (
    <div className="p-3 bg-red-500/20 border-b border-red-500/50">
      <div className="text-red-400 text-sm">{message}</div>
    </div>
  );
};

export default ErrorBanner;

