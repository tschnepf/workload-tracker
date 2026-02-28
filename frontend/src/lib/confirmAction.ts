import { getFlag } from '@/lib/flags';
import { enqueueConfirm, type ConfirmActionOptions } from '@/lib/dialogBus';

function normalizeOptions(options: ConfirmActionOptions | string): ConfirmActionOptions {
  if (typeof options === 'string') {
    return { message: options };
  }
  return options;
}

export async function confirmAction(options: ConfirmActionOptions | string): Promise<boolean> {
  const normalized = normalizeOptions(options);

  if (!getFlag('FF_DIALOG_SYSTEM', false)) {
    if (typeof window === 'undefined') return false;
    return window.confirm(normalized.message);
  }

  return enqueueConfirm(normalized);
}

