import React from 'react';

export interface LegendProps {
  labels: { blue: string; green: string; orange: string; red: string };
}

const Legend: React.FC<LegendProps> = ({ labels }) => {
  return (
    <div className="flex gap-6">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
        <span>Available ({labels.blue})</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
        <span>Optimal ({labels.green})</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
        <span>Full ({labels.orange})</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500"></div>
        <span>Overallocated ({labels.red})</span>
      </div>
    </div>
  );
};

export default Legend;

