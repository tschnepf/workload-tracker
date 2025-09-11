import React from 'react';

type LoaderProps = {
  message?: string;
  full?: boolean; // occupy full viewport height
  inline?: boolean; // do not center with flex container
  className?: string;
};

const Loader: React.FC<LoaderProps> = ({ message = 'Loading…', full = false, inline = false, className = '' }) => {
  const containerClasses = inline
    ? className
    : `${className} ${full ? 'min-h-screen' : 'min-h-[60vh]'} flex items-center justify-center`;

  return (
    <div role="status" aria-live="polite" aria-busy="true" className={containerClasses}>
      <div className="flex items-center space-x-3">
        <div className="animate-spin motion-reduce:animate-none rounded-full h-6 w-6 border-b-2 border-[#007acc]" aria-hidden="true"></div>
        <div className="text-[#969696]">{message}</div>
      </div>
    </div>
  );
};

export default Loader;
