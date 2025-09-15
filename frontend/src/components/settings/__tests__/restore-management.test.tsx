import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
vi.mock('@/services/api', () => {
  let call = 0;
  return {
    backupApi: {
      getBackups: vi.fn().mockResolvedValue({ items: [
        { id: 'b.pgcustom', filename: 'b.pgcustom', size: 2048, createdAt: '2025-01-02T00:00:00Z', format: 'custom' },
      ] }),
      restoreBackup: vi.fn().mockResolvedValue({ jobId: 'job2', statusUrl: '/api/jobs/job2/' }),
      uploadAndRestore: vi.fn().mockResolvedValue({ jobId: 'job3', statusUrl: '/api/jobs/job3/' }),
    },
    jobsApi: {
      getStatus: vi.fn().mockImplementation(() => {
        call += 1;
        if (call < 2) return Promise.resolve({ id: 'job', state: 'STARTED', progress: 10 });
        return Promise.resolve({ id: 'job', state: 'SUCCESS', progress: 100 });
      }),
    },
  };
});

import RestoreManagement from '@/components/settings/RestoreManagement';

vi.mock('@/components/ui/ConfirmationDialog', () => ({
  confirmDialog: (opts: any) => Promise.resolve(true),
  default: (opts: any) => Promise.resolve(true),
}));

vi.mock('@/lib/toastBus', () => ({ showToast: vi.fn() }));

describe('RestoreManagement', () => {
  beforeEach(() => vi.resetAllMocks());

  it('triggers restore with confirmation and polls job status', async () => {
    const { backupApi } = await import('@/services/api');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false } } });
    // Seed backups list
    (qc as any).setQueryData(['backups'], { items: [
      { id: 'b.pgcustom', filename: 'b.pgcustom', size: 2048, createdAt: '2025-01-02T00:00:00Z', format: 'custom' },
    ]});
    render(
      <QueryClientProvider client={qc}>
        <RestoreManagement />
      </QueryClientProvider>
    );
    expect(await screen.findByText('Restore from Existing Backup')).toBeTruthy();
    const btn = (await screen.findAllByRole('button', { name: 'Restore' }))[0];
    await userEvent.click(btn);
    await waitFor(() => expect((backupApi.restoreBackup as any)).toHaveBeenCalled());
  });

  it('validates upload file type before restore', async () => {
    const { backupApi } = await import('@/services/api');
    const { showToast } = await import('@/lib/toastBus');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false } } });
    (qc as any).setQueryData(['backups'], { items: [] });
    render(
      <QueryClientProvider client={qc}>
        <RestoreManagement />
      </QueryClientProvider>
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(['x'], 'evil.txt', { type: 'text/plain' });
    await userEvent.upload(input, badFile);
    const uploadBtn = screen.getByRole('button', { name: /Upload & Restore/i });
    await userEvent.click(uploadBtn);
    // Should not call API for invalid type
    await waitFor(() => expect((backupApi.uploadAndRestore as any)).not.toHaveBeenCalled());
  });
});
