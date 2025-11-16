import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntegrationsSection from '../IntegrationsSection';

const mockListProviders = vi.fn();
const mockListConnections = vi.fn();
const mockGetCatalog = vi.fn();
const mockListRules = vi.fn();
const mockCreateRule = vi.fn();
const mockUpdateRule = vi.fn();
const mockGetMapping = vi.fn();
const mockSaveMapping = vi.fn();
const mockListJobs = vi.fn();
const mockGetHealth = vi.fn();
const mockCreateConnection = vi.fn();
const mockUpdateConnection = vi.fn();
const mockResyncRule = vi.fn();
const mockGetSecretKeyStatus = vi.fn();
const mockSetSecretKey = vi.fn();

vi.mock('@/pages/Settings/SettingsDataContext', () => ({
  useSettingsData: () => ({
    auth: { user: { is_staff: true } },
    capsQuery: { data: { integrations: { enabled: true } }, isLoading: false },
    caps: { integrations: { enabled: true } },
  }),
}));

vi.mock('@/services/integrationsApi', () => ({
  listProviders: mockListProviders,
  listConnections: mockListConnections,
  createConnection: mockCreateConnection,
  updateConnection: mockUpdateConnection,
  getProviderCatalog: mockGetCatalog,
  listRules: mockListRules,
  createRule: mockCreateRule,
  updateRule: mockUpdateRule,
  getMappingDefaults: mockGetMapping,
  saveMapping: mockSaveMapping,
  listJobs: mockListJobs,
  getHealth: mockGetHealth,
  resyncRule: mockResyncRule,
  getSecretKeyStatus: mockGetSecretKeyStatus,
  setSecretKey: mockSetSecretKey,
}));

const baseRuleConfig = {
  objectKey: 'projects',
  fields: ['projectId', 'name'],
  filters: {},
  intervalMinutes: 60,
  syncBehavior: 'delta',
  conflictPolicy: 'upsert',
  deletionPolicy: 'mark_inactive_keep_link',
  includeSubprojects: false,
  initialSyncMode: 'full_once',
  clientSyncPolicy: 'preserve_local' as const,
  dryRun: false,
};

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntegrationsSection />
    </QueryClientProvider>,
  );
}

describe('IntegrationsSection', () => {
  beforeEach(() => {
    const provider = { key: 'bqe', displayName: 'BQE CORE', schemaVersion: '1.0.0', metadata: {} };
    mockListProviders.mockResolvedValue([provider]);
    mockListConnections.mockResolvedValue([
      {
        id: 1,
        provider: 'bqe',
        providerDisplayName: 'BQE CORE',
        company_id: 'acme',
        environment: 'sandbox',
        is_active: true,
        needs_reauth: false,
        is_disabled: false,
        extra_headers: {},
        created_at: '',
        updated_at: '',
      },
    ]);
    mockGetCatalog.mockResolvedValue({
      key: 'bqe',
      displayName: 'BQE CORE',
      schemaVersion: '1.0.0',
      objects: [
        {
          key: 'projects',
          label: 'Projects',
          fields: [
            { key: 'projectId', label: 'Project ID' },
            { key: 'name', label: 'Name' },
          ],
        },
      ],
    });
    mockListRules.mockResolvedValue([
      {
        id: 9,
        connection: 1,
        object_key: 'projects',
        config: baseRuleConfig,
        is_enabled: true,
        revision: 1,
        next_run_at: null,
        last_run_at: null,
        last_success_at: null,
        last_error: '',
        resync_required: false,
        created_at: '',
        updated_at: '',
      },
    ]);
    mockCreateRule.mockResolvedValue({});
    mockUpdateRule.mockResolvedValue({});
    mockGetMapping.mockResolvedValue({
      defaults: [{ source: 'name', target: 'project.name', behavior: 'follow_bqe' }],
      overrides: null,
      schemaVersion: '1.0.0',
      stale: false,
      fieldSignatureHash: 'hash',
    });
    mockSaveMapping.mockResolvedValue({});
    mockListJobs.mockResolvedValue([]);
    mockGetHealth.mockResolvedValue({ healthy: true, workersAvailable: true, cacheAvailable: true });
    mockCreateConnection.mockResolvedValue({});
    mockUpdateConnection.mockResolvedValue({});
    mockResyncRule.mockResolvedValue({});
    mockGetSecretKeyStatus.mockResolvedValue({ configured: true });
    mockSetSecretKey.mockResolvedValue({ configured: true });
  });

  it('renders provider and connection info', async () => {
    renderSection();
    expect(await screen.findByText('BQE CORE')).toBeInTheDocument();
    expect(screen.getByText(/Company ID/i)).toHaveTextContent('acme');
  });

  it('disables include subprojects toggle for BQE', async () => {
    renderSection();
    await waitFor(() => expect(mockListRules).toHaveBeenCalled());
    const checkbox = screen.getByLabelText(/Include subprojects/i) as HTMLInputElement;
    expect(checkbox).toBeDisabled();
  });

  it('shows client sync policy select with default value', async () => {
    renderSection();
    await waitFor(() => expect(mockListRules).toHaveBeenCalled());
    const select = screen.getByLabelText(/Client sync policy/i) as HTMLSelectElement;
    expect(select.value).toBe('preserve_local');
  });

  it('prompts for secret key when not configured', async () => {
    mockGetSecretKeyStatus.mockResolvedValueOnce({ configured: false });
    renderSection();
    expect(await screen.findByText(/encrypt OAuth tokens/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/Fernet secret key/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('generates a key via button', async () => {
    const originalCrypto = global.crypto;
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i += 1) arr[i] = 1;
      return arr;
    });
    Object.defineProperty(global, 'crypto', { value: { getRandomValues }, configurable: true });
    mockGetSecretKeyStatus.mockResolvedValueOnce({ configured: false });
    renderSection();
    const button = await screen.findByRole('button', { name: /Generate key/i });
    button.click();
    const input = screen.getByLabelText(/Fernet secret key/i) as HTMLInputElement;
    expect(input.value.length).toBeGreaterThan(20);
    Object.defineProperty(global, 'crypto', { value: originalCrypto, configurable: true });
  });
});
