import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { darkTheme } from '@/theme/tokens';

type ConfirmOptions = {
  title: string;
  message: React.ReactNode;
  requiredText?: string; // when provided, user must type this exactly
  confirmLabel?: string;
  cancelLabel?: string;
};

const DialogBody: React.FC<{
  options: ConfirmOptions;
  onResolve: (confirmed: boolean) => void;
}> = ({ options, onResolve }) => {
  const [open, setOpen] = useState(true);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    return () => {
      // cleanup if needed
    };
  }, []);

  const canConfirm = options.requiredText ? typed.trim() === options.requiredText : true;

  return (
    <Modal isOpen={open} onClose={() => { setOpen(false); onResolve(false); }} title={options.title}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          color: darkTheme.colors.text.primary,
          border: `1px solid ${darkTheme.colors.semantic.error}40`,
          padding: '12px 14px',
          borderRadius: 8,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: darkTheme.colors.semantic.error }}>Dangerous operation</div>
          <div style={{ color: darkTheme.colors.text.secondary }}>{options.message}</div>
        </div>

        {options.requiredText && (
          <div>
            <Input
              label={`Type to confirm: ${options.requiredText}`}
              placeholder={options.requiredText}
              value={typed}
              onChange={(e) => setTyped((e.target as HTMLInputElement).value)}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={() => { setOpen(false); onResolve(false); }}>
            {options.cancelLabel || 'Cancel'}
          </Button>
          <Button variant="danger" onClick={() => { setOpen(false); onResolve(true); }} disabled={!canConfirm}>
            {options.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return new Promise<boolean>((resolve) => {
    const handleResolve = (confirmed: boolean) => {
      try { root.unmount(); } catch {}
      container.remove();
      resolve(confirmed);
    };
    root.render(<DialogBody options={options} onResolve={handleResolve} />);
  });
}

export default confirmDialog;

