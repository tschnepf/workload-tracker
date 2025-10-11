import React from 'react';

interface Props {
  warnings: string[];
}

const WarningsBanner: React.FC<Props> = ({ warnings }) => {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="p-3 bg-amber-500/20 border-b border-amber-500/50">
      {warnings.map((warning, index) => (
        <div key={index} className="text-amber-400 text-sm flex items-center gap-2">
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
};

export default WarningsBanner;

