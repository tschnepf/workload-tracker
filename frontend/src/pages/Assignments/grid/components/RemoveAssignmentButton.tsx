import React from 'react';

export interface RemoveAssignmentButtonProps {
  onClick: () => void;
  title?: string;
}

const RemoveAssignmentButton: React.FC<RemoveAssignmentButtonProps> = ({ onClick, title = 'Remove assignment' }) => (
  <button
    onClick={onClick}
    className="w-4 h-4 flex items-center justify-center text-[var(--muted)] hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
    title={title}
  >
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
);

export default RemoveAssignmentButton;

