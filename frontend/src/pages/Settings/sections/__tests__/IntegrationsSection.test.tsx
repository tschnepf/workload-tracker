import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const mockGetProjectMatchSuggestions = vi.fn();
const mockConfirmProjectMatches = vi.fn();
const mockRetryJob = vi.fn();
const mockGetProviderCredentials = vi.fn();
const mockSaveProviderCredentials = vi.fn();
const mockResetProvider = vi.fn();
const mockStartConnectionOAuth = vi.fn();
const mockTestConnection = vi.fn();
const mockTestActivityConnection = vi.fn();
const originalWindowOpen = window.open;

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
  getProjectMatchSuggestions: mockGetProjectMatchSuggestions,
  confirmProjectMatches: mockConfirmProjectMatches,
  retryJob: mockRetryJob,
  startConnectionOAuth: mockStartConnectionOAuth,
  testConnection: mockTestConnection,
  testActivityConnection: mockTestActivityConnection,
  getProviderCredentials: mockGetProviderCredentials,
  saveProviderCredentials: mockSaveProviderCredentials,
  resetProvider: mockResetProvider,
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
    vi.clearAllMocks();
    const provider = { key: 'bqe', displayName: 'BQE CORE', schemaVersion: '1.0.0', metadata: {} };
    mockListProviders.mockResolvedValue([provider]);
    mockListConnections.mockResolvedValue([
      {
        id: 1,
        provider: 'bqe',
        providerDisplayName: 'BQE CORE',
        environment: 'sandbox',
        is_active: true,
        needs_reauth: false,
        is_disabled: false,
        hasToken: true,
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
    mockGetHealth.mockResolvedValue({
      healthy: true,
      workersAvailable: true,
      cacheAvailable: true,
      schedulerPaused: false,
      jobs: {
        running: 0,
        lastJobAt: null,
        lastFailureAt: null,
        recent: {
          windowHours: 24,
          total: 0,
          succeeded: 0,
          failed: 0,
          successRate: null,
          itemsProcessed: 0,
        },
      },
    });
    mockCreateConnection.mockResolvedValue({});
    mockUpdateConnection.mockResolvedValue({});
    mockResyncRule.mockResolvedValue({});
    mockGetSecretKeyStatus.mockResolvedValue({ configured: true });
    mockSetSecretKey.mockResolvedValue({ configured: true });
    mockGetProjectMatchSuggestions.mockResolvedValue({
      items: [],
      summary: { total: 0 },
      localProjects: [],
    });
    mockConfirmProjectMatches.mockResolvedValue({ updated: 0, skipped: 0 });
    mockRetryJob.mockResolvedValue(undefined);
    mockGetProviderCredentials.mockResolvedValue({
      clientId: 'abc123',
      redirectUri: 'https://example.com/callback',
      hasClientSecret: true,
      configured: true,
    });
    mockSaveProviderCredentials.mockResolvedValue({
      clientId: 'abc123',
      redirectUri: 'https://example.com/callback',
      hasClientSecret: true,
      configured: true,
    });
    mockStartConnectionOAuth.mockResolvedValue({ authorizeUrl: 'https://example.com/oauth', state: 'abc' });
    (window as any).open = vi.fn(() => ({ close: vi.fn() }));
    mockTestConnection.mockResolvedValue({
      ok: true,
      provider: 'BQE CORE',
      environment: 'sandbox',
      checkedAt: new Date().toISOString(),
      sampleCount: 1,
      message: 'Connected',
    });
    mockTestActivityConnection.mockResolvedValue({
      ok: true,
      provider: 'BQE CORE',
      environment: 'sandbox',
      checkedAt: new Date().toISOString(),
      sampleCount: 1,
      message: 'Activities reachable',
    });
  });

  afterEach(() => {
    (window as any).open = originalWindowOpen;
  });

  it('renders provider and connection info', async () => {
    renderSection();
    expect(await screen.findByText('BQE CORE')).toBeInTheDocument();
    expect(screen.getByText(/Environment/i)).toBeInTheDocument();
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

  it('renders provider credential inputs', async () => {
    renderSection();
    expect(await screen.findByText(/Provider Credentials/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
  });

  it('prompts for secret key when not configured', async () => {
    mockGetSecretKeyStatus.mockResolvedValueOnce({ configured: false });
    renderSection();
    expect(await screen.findByText(/encrypt OAuth tokens/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/Fernet secret key/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('disables matching actions until OAuth completes', async () => {
    mockListConnections.mockResolvedValueOnce([
      {
        id: 5,
        provider: 'bqe',
        providerDisplayName: 'BQE CORE',
        environment: 'sandbox',
        is_active: true,
        needs_reauth: false,
        is_disabled: false,
        hasToken: false,
        extra_headers: {},
        created_at: '',
        updated_at: '',
      },
    ]);
    renderSection();
    expect(await screen.findByText('BQE CORE')).toBeInTheDocument();
    const button = await screen.findByRole('button', { name: /Load Initial Matching/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/OAuth pending/i)).toBeInTheDocument();
  });

  it('reuses the existing environment connection when reconnecting via the modal', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('BQE CORE');
    await user.click(screen.getByRole('button', { name: /Add BQE CORE Connection/i }));
    expect(await screen.findByText(/already has a Sandbox connection/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mockStartConnectionOAuth).toHaveBeenCalledWith('bqe', 1));
    expect(mockCreateConnection).not.toHaveBeenCalled();
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

  it('loads matching suggestions when requested', async () => {
    renderSection();
    mockGetProjectMatchSuggestions.mockResolvedValueOnce({
      items: [
        {
          externalId: '10',
          externalName: 'Remote Project',
          externalNumber: 'P-10',
          externalClient: 'Client',
          status: 'matched',
          matchReason: 'project_number',
          matchedProject: { id: 7, name: 'Local', client: 'Client', projectNumber: 'P-10' },
          candidates: [],
        },
      ],
      summary: { total: 1, matched: 1 },
      localProjects: [{ id: 7, name: 'Local', client: 'Client', projectNumber: 'P-10' }],
    });
    const button = await screen.findByRole('button', { name: /Load Initial Matching/i });
    button.click();
    expect(await screen.findByText(/Remote Project/)).toBeInTheDocument();
  });

  it('tests the connection when button is clicked', async () => {
    renderSection();
    const button = await screen.findByRole('button', { name: /Test Connection/i });
    button.click();
    await waitFor(() => expect(mockTestConnection).toHaveBeenCalled());
  });

  it('tests the activities endpoint when button is clicked', async () => {
    renderSection();
    const button = await screen.findByRole('button', { name: /Test Activities Endpoint/i });
    await userEvent.click(button);
    await waitFor(() => expect(mockTestActivityConnection).toHaveBeenCalled());
  });

  it('starts OAuth when reconnect button is clicked', async () => {
    renderSection();
    const button = await screen.findByRole('button', { name: /Reconnect OAuth/i });
    button.click();
    await waitFor(() => expect(mockStartConnectionOAuth).toHaveBeenCalled());
  });

  it('shows worker paused banner when scheduler is paused', async () => {
    mockGetHealth.mockResolvedValueOnce({
      healthy: false,
      workersAvailable: false,
      cacheAvailable: true,
      schedulerPaused: true,
      jobs: {
        running: 0,
        lastJobAt: null,
        lastFailureAt: null,
        recent: {
          windowHours: 24,
          total: 0,
          succeeded: 0,
          failed: 0,
          successRate: null,
          itemsProcessed: 0,
        },
      },
      message: 'offline',
    });
    renderSection();
    expect(await screen.findByText(/Sync temporarily paused/i)).toBeInTheDocument();
  });

  it('shows connection attention banner when reauth is required', async () => {
    mockListConnections.mockResolvedValueOnce([
      {
        id: 42,
        provider: 'bqe',
        providerDisplayName: 'BQE CORE',
        environment: 'sandbox',
        is_active: true,
        needs_reauth: true,
        is_disabled: false,
        hasToken: true,
        extra_headers: {},
        created_at: '',
        updated_at: '',
      },
    ]);
    renderSection();
    expect(await screen.findByText(/Admin attention needed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revoke tokens/i })).toBeInTheDocument();
  });
});
