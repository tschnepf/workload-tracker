import React from 'react';

export interface DeleteConfirmProps {
  open: boolean;
  title?: string;
  message?: string;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirm(props: DeleteConfirmProps) {
  const { open, title = 'Delete', message, confirming, onConfirm, onCancel } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
            {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)] rounded transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2">
            {confirming ? (
              <>
                <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin motion-reduce:animate-none"></div>
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
