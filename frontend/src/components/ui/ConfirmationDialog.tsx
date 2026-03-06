import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

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
    <Modal
      isOpen={open}
      onClose={() => { setOpen(false); onResolve(false); }}
      title={options.title}
      footer={(
        <>
          <Button variant="ghost" onClick={() => { setOpen(false); onResolve(false); }}>
            {options.cancelLabel || 'Cancel'}
          </Button>
          <Button variant="danger" onClick={() => { setOpen(false); onResolve(true); }} disabled={!canConfirm}>
            {options.confirmLabel || 'Confirm'}
          </Button>
        </>
      )}
    >
      <div className="grid gap-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-state-danger)] bg-[color:color-mix(in_srgb,var(--color-state-danger)_14%,transparent)] px-3 py-3 text-[var(--color-text-primary)]">
          <div className="mb-1 font-semibold text-[var(--color-state-danger)]">Dangerous operation</div>
          <div className="text-[var(--color-text-secondary)]">{options.message}</div>
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
