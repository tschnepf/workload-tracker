import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/services/api', () => {
  return {
    backupApi: {
      getBackupStatus: vi.fn(),
    },
  };
});

import BackupOverview from '@/components/settings/BackupOverview';

vi.mock('@/services/api', () => {
  return {
    backupApi: {
      getBackupStatus: vi.fn(),
    },
  };
});

describe('BackupOverview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows last backup, retention and encryption status', async () => {
    const { backupApi } = await import('@/services/api');
    (backupApi.getBackupStatus as any).mockResolvedValue({
      lastBackupAt: '2025-01-01T00:00:00Z',
      lastBackupSize: 1048576,
      retentionOk: true,
      offsiteEnabled: false,
      policy: 'daily=7 weekly=4 monthly=12',
      encryptionEnabled: true,
      encryptionProvider: 'gpg',
    });

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <BackupOverview />
      </QueryClientProvider>
    );
    expect(await screen.findByText('Backup Status')).toBeTruthy();
    expect(await screen.findByText('Last Backup')).toBeTruthy();
    expect(await screen.findByText('Last Backup Size')).toBeTruthy();
    expect(await screen.findByText('Retention')).toBeTruthy();
    expect(await screen.findByText(/Encryption/i)).toBeTruthy();
    expect(await screen.findByText(/Enabled \(gpg\)/i)).toBeTruthy();
  });
});
