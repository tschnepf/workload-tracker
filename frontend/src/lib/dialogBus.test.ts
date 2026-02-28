import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingConfirms,
  enqueueConfirm,
  resolveActiveConfirm,
  subscribeConfirms,
} from '@/lib/dialogBus';

describe('dialogBus', () => {
  beforeEach(() => {
    clearPendingConfirms();
  });

  it('notifies when resolving the only active confirm', async () => {
    let notifyCount = 0;
    const unsubscribe = subscribeConfirms(() => {
      notifyCount += 1;
    });

    const pending = enqueueConfirm({ message: 'Are you sure?' });
    expect(notifyCount).toBe(1);

    resolveActiveConfirm(false);
    await expect(pending).resolves.toBe(false);
    expect(notifyCount).toBe(2);

    unsubscribe();
  });

  it('advances queue and resolves both confirms', async () => {
    let notifyCount = 0;
    const unsubscribe = subscribeConfirms(() => {
      notifyCount += 1;
    });

    const first = enqueueConfirm({ message: 'First' });
    const second = enqueueConfirm({ message: 'Second' });

    expect(notifyCount).toBe(2);

    resolveActiveConfirm(true);
    await expect(first).resolves.toBe(true);
    expect(notifyCount).toBe(3);

    resolveActiveConfirm(false);
    await expect(second).resolves.toBe(false);
    expect(notifyCount).toBe(4);

    unsubscribe();
  });
});

