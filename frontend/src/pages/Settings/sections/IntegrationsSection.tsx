import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Loader from '@/components/ui/Loader';
import Modal from '@/components/ui/Modal';
import { useSettingsData } from '../SettingsDataContext';
import {
  listProviders,
  listConnections,
  createConnection,
  updateConnection,
  getProviderCatalog,
  listRules,
  createRule,
  updateRule,
  getMappingDefaults,
  saveMapping,
  listJobs,
  getHealth,
  resyncRule,
  getSecretKeyStatus,
  setSecretKey,
  type IntegrationProviderSummary,
  type IntegrationConnection,
  type IntegrationRule,
  type IntegrationRuleConfig,
  type IntegrationMappingEntry,
  type IntegrationCatalogObject,
  type IntegrationMappingState,
  type IntegrationJob,
  type IntegrationHealth,
  type SecretKeyStatus,
} from '@/services/integrationsApi';
import { showToast } from '@/lib/toastBus';

export const INTEGRATIONS_SECTION_ID = 'integrations';

const SELECT_STYLES = `
  w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface)]
  border-[var(--border)] text-[var(--text)] focus:border-[var(--focus)]
  focus:ring-1 focus:ring-[var(--focus)] focus:outline-none motion-reduce:transition-none
  min-h-[44px]
`;

const behaviorOptions = [
  { value: 'follow_bqe', label: 'Follow BQE' },
  { value: 'preserve_local', label: 'Preserve Local' },
  { value: 'write_once', label: 'Write Once' },
];

const clientPolicyOptions: Array<{ value: IntegrationRuleConfig['clientSyncPolicy']; label: string }> = [
  { value: 'preserve_local', label: 'Preserve Local (default)' },
  { value: 'follow_bqe', label: 'Follow BQE' },
  { value: 'write_once', label: 'Write Once' },
];

type ConnectFormState = { companyId: string; environment: 'sandbox' | 'production' };

function generateFernetKey(): string {
  const cryptoObj: Crypto | undefined = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (!cryptoObj?.getRandomValues) {
    throw new Error('Secure random generator unavailable in this browser.');
  }
  const bytes = new Uint8Array(32);
  cryptoObj.getRandomValues(bytes);
  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
  }
  const bufferGlobal = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (bufferGlobal) {
    return bufferGlobal.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }
  throw new Error('Base64 encoder unavailable');
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return value;
  }
}

function buildDefaultRuleConfig(objectKey: string, meta?: IntegrationCatalogObject): IntegrationRuleConfig {
  const fieldCandidates = meta?.fields ?? [];
  const defaults = fieldCandidates.length ? fieldCandidates.slice(0, 5).map((f) => f.key) : ['projectId', 'name', 'status'];
  return {
    objectKey,
    fields: defaults,
    filters: {},
    intervalMinutes: 60,
    syncBehavior: 'delta',
    conflictPolicy: 'upsert',
    deletionPolicy: 'mark_inactive_keep_link',
    includeSubprojects: false,
    initialSyncMode: 'full_once',
    clientSyncPolicy: 'preserve_local',
    dryRun: false,
  };
}

const IntegrationsSection: React.FC = () => {
  const { caps } = useSettingsData();
  const queryClient = useQueryClient();

  const secretKeyQueryKey = ['integrations', 'secret-key'] as const;
  const secretKeyQuery = useQuery<SecretKeyStatus, Error>({
    queryKey: secretKeyQueryKey,
    queryFn: () => getSecretKeyStatus(),
    staleTime: 60 * 1000,
  });
  const secretKeyConfigured = secretKeyQuery.data?.configured ?? false;
  const [secretKeyInput, setSecretKeyInput] = useState('');
  const secretKeyMutation = useMutation({
    mutationFn: (value: string) => setSecretKey(value),
    onSuccess: () => {
      showToast('Secret key saved', 'success');
      setSecretKeyInput('');
      queryClient.invalidateQueries({ queryKey: secretKeyQueryKey });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to save secret key', 'error'),
  });
  const handleGenerateKey = () => {
    try {
      const key = generateFernetKey();
      setSecretKeyInput(key);
      showToast('Generated a new Fernet key. Click Save to apply it.', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Unable to generate key in this browser.', 'error');
    }
  };

  const providersQuery = useQuery({
    queryKey: ['integrations', 'providers'],
    queryFn: () => listProviders(),
    staleTime: 5 * 60 * 1000,
    enabled: secretKeyConfigured,
  });
  const providers = providersQuery.data ?? [];
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedProviderKey && providers.length > 0) {
      setSelectedProviderKey(providers[0].key);
    }
  }, [providers, selectedProviderKey]);
  const selectedProvider = providers.find((p) => p.key === selectedProviderKey) ?? providers[0];

  const connectionsQuery = useQuery({
    queryKey: ['integrations', 'connections', selectedProviderKey],
    queryFn: () => listConnections(selectedProviderKey || undefined),
    enabled: secretKeyConfigured && !!selectedProviderKey,
  });
  const connections = connectionsQuery.data ?? [];
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  useEffect(() => {
    if (!connections.length) {
      setSelectedConnectionId(null);
      return;
    }
    if (selectedConnectionId == null || !connections.some((c) => c.id === selectedConnectionId)) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId) ?? null;

  const providerCatalogQuery = useQuery({
    queryKey: ['integrations', 'catalog', selectedProviderKey],
    queryFn: () => getProviderCatalog(selectedProviderKey!),
    enabled: secretKeyConfigured && !!selectedProviderKey,
    staleTime: 10 * 60 * 1000,
  });
  const providerObjects = providerCatalogQuery.data?.objects ?? [];

  const [selectedObjectKey, setSelectedObjectKey] = useState('projects');
  useEffect(() => {
    if (!providerObjects.length) return;
    if (!providerObjects.some((obj) => obj.key === selectedObjectKey)) {
      setSelectedObjectKey(providerObjects[0].key);
    }
  }, [providerObjects, selectedObjectKey]);
  const selectedObject = providerObjects.find((obj) => obj.key === selectedObjectKey);

  const rulesQuery = useQuery({
    queryKey: ['integrations', 'rules', selectedConnectionId],
    queryFn: () => listRules({ connection: selectedConnectionId ?? undefined }),
    enabled: !!selectedConnectionId,
  });
  const rules = rulesQuery.data ?? [];
  const activeRule: IntegrationRule | undefined = rules.find((rule) => rule.object_key === selectedObjectKey);

  const [ruleForm, setRuleForm] = useState<IntegrationRuleConfig>(() =>
    buildDefaultRuleConfig(selectedObjectKey, selectedObject)
  );
  useEffect(() => {
    if (activeRule) {
      setRuleForm({
        ...activeRule.config,
        objectKey: selectedObjectKey,
      });
    } else if (selectedObjectKey) {
      setRuleForm(buildDefaultRuleConfig(selectedObjectKey, selectedObject));
    }
  }, [activeRule, selectedObjectKey, selectedObject]);

  const mappingQuery = useQuery({
    queryKey: ['integrations', 'mapping', selectedProviderKey, selectedObjectKey, selectedConnectionId],
    queryFn: () => getMappingDefaults(selectedProviderKey!, selectedObjectKey, selectedConnectionId ?? undefined),
    enabled: !!selectedProviderKey && !!selectedObjectKey && !!selectedConnectionId,
  });
  const mappingState: IntegrationMappingState | undefined = mappingQuery.data;
  const [mappingDraft, setMappingDraft] = useState<IntegrationMappingEntry[]>([]);
  useEffect(() => {
    if (!mappingState) return;
    const entries = mappingState.overrides?.mappings ?? mappingState.defaults ?? [];
    setMappingDraft(entries.map((entry) => ({ ...entry })));
  }, [mappingState]);

  const jobsQuery = useQuery({
    queryKey: ['integrations', 'jobs', selectedProviderKey, selectedConnectionId],
    queryFn: () => listJobs(selectedProviderKey!, { connection: selectedConnectionId ?? undefined, limit: 10 }),
    enabled: !!selectedProviderKey && !!selectedConnectionId,
    refetchInterval: 30_000,
  });
  const jobs = jobsQuery.data ?? [];

  const healthQuery = useQuery({
    queryKey: ['integrations', 'health'],
    queryFn: () => getHealth(),
    refetchInterval: 60_000,
  });
  const health: IntegrationHealth | undefined = healthQuery.data;
  const syncDisabled = !!health && !health.healthy;

  const metadataMismatch = providerCatalogQuery.data && selectedProvider
    && providerCatalogQuery.data.schemaVersion !== selectedProvider.schemaVersion;

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectForm, setConnectForm] = useState<ConnectFormState>({ companyId: '', environment: 'sandbox' });
  const [resyncModalOpen, setResyncModalOpen] = useState(false);
  const [resyncScope, setResyncScope] = useState<'delta_from_now' | 'full'>('delta_from_now');

  const queryConnectionsKey = ['integrations', 'connections', selectedProviderKey];
  const queryRulesKey = ['integrations', 'rules', selectedConnectionId];
  const queryMappingKey = ['integrations', 'mapping', selectedProviderKey, selectedObjectKey, selectedConnectionId];
  const queryJobsKey = ['integrations', 'jobs', selectedProviderKey, selectedConnectionId];

  const createConnectionMutation = useMutation({
    mutationFn: () => createConnection({
      providerKey: selectedProviderKey!,
      company_id: connectForm.companyId.trim(),
      environment: connectForm.environment,
    }),
    onSuccess: (data: IntegrationConnection) => {
      showToast('Connection created', 'success');
      setConnectModalOpen(false);
      setSelectedConnectionId(data.id);
      queryClient.invalidateQueries({ queryKey: queryConnectionsKey });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create connection', 'error'),
  });

  const updateConnectionMutation = useMutation({
    mutationFn: (payload: Partial<IntegrationConnection>) => updateConnection(selectedConnectionId!, payload),
    onSuccess: () => {
      showToast('Connection updated', 'success');
      queryClient.invalidateQueries({ queryKey: queryConnectionsKey });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update connection', 'error'),
  });

  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConnectionId) throw new Error('Select a connection before saving rules.');
      if (activeRule) {
        return updateRule(activeRule.id, {
          object_key: selectedObjectKey,
          config: { ...ruleForm, objectKey: selectedObjectKey },
          is_enabled: true,
        });
      }
      return createRule({
        connection_id: selectedConnectionId,
        object_key: selectedObjectKey,
        config: { ...ruleForm, objectKey: selectedObjectKey },
        is_enabled: true,
      });
    },
    onSuccess: () => {
      showToast('Rule saved', 'success');
      queryClient.invalidateQueries({ queryKey: queryRulesKey });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to save rule', 'error'),
  });

  const saveMappingMutation = useMutation({
    mutationFn: () => saveMapping({
      providerKey: selectedProviderKey!,
      objectKey: selectedObjectKey,
      connectionId: selectedConnectionId!,
      version: mappingState?.schemaVersion,
      mappings: mappingDraft,
    }),
    onSuccess: () => {
      showToast('Mapping saved', 'success');
      queryClient.invalidateQueries({ queryKey: queryMappingKey });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to save mapping', 'error'),
  });

  const resyncMutation = useMutation({
    mutationFn: () => resyncRule(activeRule!.id, resyncScope),
    onSuccess: () => {
      showToast('Resync enqueued', 'success');
      setResyncModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryRulesKey });
      queryClient.invalidateQueries({ queryKey: queryJobsKey });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to enqueue resync', 'error'),
  });

  const handleFieldToggle = (fieldKey: string) => {
    setRuleForm((prev) => {
      const exists = prev.fields.includes(fieldKey);
      if (exists) {
        return { ...prev, fields: prev.fields.filter((f) => f !== fieldKey) };
      }
      return { ...prev, fields: [...prev.fields, fieldKey] };
    });
  };

  const mappingIsDirty = useMemo(() => {
    if (!mappingState) return false;
    const baseline = mappingState.overrides?.mappings ?? mappingState.defaults ?? [];
    if (baseline.length !== mappingDraft.length) return true;
    return baseline.some((row, idx) => {
      const current = mappingDraft[idx];
      return row.source !== current.source || row.target !== current.target || (row.behavior || '') !== (current.behavior || '');
    });
  }, [mappingDraft, mappingState]);

  const providersReady = !providersQuery.isLoading && !providersQuery.isError;
  const connecting = createConnectionMutation.isPending;

  const connectionSelector = connections.length > 1 ? (
    <label className="block text-sm text-[var(--muted)] mt-2">
      Active connection
      <select
        className={SELECT_STYLES}
        value={selectedConnectionId ?? ''}
        onChange={(e) => setSelectedConnectionId(e.target.value ? Number(e.target.value) : null)}
      >
        {connections.map((conn) => (
          <option key={conn.id} value={conn.id}>
            {conn.company_id} ({conn.environment})
          </option>
        ))}
      </select>
    </label>
  ) : null;

  const providerList = providersReady ? (
    <div className="grid gap-3 md:grid-cols-3">
      {providers.map((provider) => (
        <button
          key={provider.key}
          type="button"
          className={clsx(
            'text-left border rounded-md p-4 transition-colors',
            provider.key === selectedProvider?.key
              ? 'border-[var(--primary)] bg-[var(--surfaceHover)]'
              : 'border-[var(--border)] hover:border-[var(--primary)]'
          )}
          onClick={() => setSelectedProviderKey(provider.key)}
        >
          <div className="text-sm text-[var(--muted)]">{provider.key.toUpperCase()}</div>
          <div className="text-lg font-semibold text-[var(--text)]">{provider.displayName}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Schema v{provider.schemaVersion}</div>
        </button>
      ))}
    </div>
  ) : null;

  const metadataWarning = metadataMismatch ? (
    <div className="rounded border border-yellow-500 bg-yellow-500/10 text-yellow-100 px-4 py-2">
      Provider metadata version changed (UI {selectedProvider?.schemaVersion} vs catalog {providerCatalogQuery.data?.schemaVersion}). Review field mappings before saving.
    </div>
  ) : null;

  if (!caps?.integrations?.enabled) {
    return (
      <SettingsSectionFrame
        id={INTEGRATIONS_SECTION_ID}
        title="Integrations Hub"
        description="Connect and configure third-party providers."
        className="mt-6"
      >
        <p className="text-[var(--muted)]">
          Integrations are disabled for this environment. Ask an administrator to set <code>INTEGRATIONS_ENABLED=true</code>.
        </p>
      </SettingsSectionFrame>
    );
  }

  if (secretKeyQuery.isLoading) {
    return (
      <SettingsSectionFrame
        id={INTEGRATIONS_SECTION_ID}
        title="Integrations Hub"
        description="Connect and configure third-party providers."
        className="mt-6"
      >
        <Loader inline message="Checking encryption key..." />
      </SettingsSectionFrame>
    );
  }

  if (secretKeyQuery.isError) {
    return (
      <SettingsSectionFrame
        id={INTEGRATIONS_SECTION_ID}
        title="Integrations Hub"
        description="Connect and configure third-party providers."
        className="mt-6"
      >
        <p className="text-red-400">Unable to verify the integrations encryption key.</p>
      </SettingsSectionFrame>
    );
  }

  if (!secretKeyConfigured) {
    return (
      <SettingsSectionFrame
        id={INTEGRATIONS_SECTION_ID}
        title="Integrations Hub"
        description="Connect and configure third-party providers."
        className="mt-6 space-y-4"
      >
        <p className="text-[var(--muted)]">
          Integrations encrypt OAuth tokens using a Fernet (MultiFernet) key. Paste your key below to unlock the hub.
          Store the key in a secret manager; this form writes it to the database encrypted with the Django SECRET_KEY.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!secretKeyInput.trim()) return;
            secretKeyMutation.mutate(secretKeyInput.trim());
          }}
          className="space-y-3 max-w-xl"
        >
          <Input
            label="Fernet secret key"
            type="password"
            value={secretKeyInput}
            onChange={(e) => setSecretKeyInput((e.target as HTMLInputElement).value)}
            required
            autoComplete="off"
          />
          <p className="text-xs text-[var(--muted)]">
            Use <code>python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"</code> to generate a key.
            Rotate keys via this form when needed; previously stored integration secrets remain readable because MultiFernet retains old keys.
          </p>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!secretKeyInput.trim() || secretKeyMutation.isPending}
            >
              {secretKeyMutation.isPending ? 'Saving...' : 'Save Key'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleGenerateKey}
            >
              Generate key
            </Button>
          </div>
        </form>
      </SettingsSectionFrame>
    );
  }

  if (providersQuery.isLoading) {
    return (
      <SettingsSectionFrame
        id={INTEGRATIONS_SECTION_ID}
        title="Integrations Hub"
        description="Connect and configure third-party providers."
        className="mt-6"
      >
        <Loader inline message="Loading providers..." />
      </SettingsSectionFrame>
    );
  }

  if (providersQuery.isError) {
    return (
      <SettingsSectionFrame
        id={INTEGRATIONS_SECTION_ID}
        title="Integrations Hub"
        description="Connect and configure third-party providers."
        className="mt-6"
      >
        <p className="text-red-400">Failed to load provider metadata.</p>
      </SettingsSectionFrame>
    );
  }

  if (!providers.length) {
    return (
      <SettingsSectionFrame
        id={INTEGRATIONS_SECTION_ID}
        title="Integrations Hub"
        description="Connect and configure third-party providers."
        className="mt-6"
      >
        <p className="text-[var(--muted)]">No providers available yet.</p>
      </SettingsSectionFrame>
    );
  }

  return (
    <SettingsSectionFrame
      id={INTEGRATIONS_SECTION_ID}
      title="Integrations Hub"
      description="Connect to BQE and manage sync rules, mapping, and job health."
      className="mt-6 space-y-6"
    >
      {syncDisabled && (
        <div className="rounded border border-yellow-500 bg-yellow-500/10 text-yellow-100 px-4 py-2">
          Background workers are unavailable ({health?.message || 'sync paused'}). Sync, mapping, and resync actions are temporarily disabled.
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-[var(--text)] mb-2">Available Integrations</h3>
        <p className="text-sm text-[var(--muted)] mb-3">
          Select the provider you want to configure. Today only <strong>BQE CORE</strong> is available; future integrations
          will appear here as additional cards.
        </p>
        {providerList}
      </div>

      {selectedProvider && (
        <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h4 className="text-base font-semibold text-[var(--text)]">{selectedProvider.displayName}</h4>
              <p className="text-sm text-[var(--muted)]">Manage connections and sync rules.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => {
                setConnectForm({ companyId: '', environment: 'sandbox' });
                setConnectModalOpen(true);
              }}>
                {connections.length ? `Add ${selectedProvider.displayName} Connection` : `Connect ${selectedProvider.displayName}`}
              </Button>
            </div>
          </div>
          {connectionsQuery.isLoading ? (
            <Loader inline message="Loading connections..." />
          ) : selectedConnection ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="px-2 py-1 rounded bg-[var(--surfaceHover)] border border-[var(--border)]">
                  Company ID: <strong>{selectedConnection.company_id}</strong>
                </span>
                <span className="px-2 py-1 rounded bg-[var(--surfaceHover)] border border-[var(--border)]">
                  Environment: <strong>{selectedConnection.environment}</strong>
                </span>
                <span className={clsx(
                  'px-2 py-1 rounded border text-xs font-semibold uppercase',
                  selectedConnection.is_active
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-200'
                    : 'bg-[var(--surfaceHover)] border-[var(--border)] text-[var(--muted)]'
                )}>
                  {selectedConnection.is_active ? 'Active' : 'Disabled'}
                </span>
                {selectedConnection.needs_reauth && (
                  <span className="px-2 py-1 rounded border border-amber-500 bg-amber-500/10 text-amber-100 text-xs font-semibold uppercase">
                    Needs re-authentication
                  </span>
                )}
              </div>
              {connectionSelector}
              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={updateConnectionMutation.isPending}
                  onClick={() => updateConnectionMutation.mutate({ is_active: !selectedConnection.is_active })}
                >
                  {selectedConnection.is_active ? 'Disable Connection' : 'Enable Connection'}
                </Button>
                {selectedConnection.needs_reauth && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={updateConnectionMutation.isPending}
                    onClick={() => updateConnectionMutation.mutate({ needs_reauth: false })}
                  >
                    Clear Reauth Flag
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="text-[var(--muted)]">
              No active connection yet. Click “Connect Provider” to add credentials.
            </div>
          )}
        </div>
      )}

      {metadataWarning}

      {selectedConnection ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border border-[var(--border)] rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold text-[var(--text)]">Sync Rules</h4>
                  <p className="text-sm text-[var(--muted)]">Control schedule, objects, and client sync policy.</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setResyncModalOpen(true)}
                  disabled={!activeRule || syncDisabled}
                >
                  Request Resync
                </Button>
              </div>
              <label className="block text-sm text-[var(--muted)]">
                Object
                <select
                  className={SELECT_STYLES}
                  value={selectedObjectKey}
                  onChange={(e) => setSelectedObjectKey(e.target.value)}
                >
                  {providerObjects.map((obj) => (
                    <option key={obj.key} value={obj.key}>
                      {obj.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="text-sm font-medium text-[var(--text)] mb-1">Fields</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto border border-[var(--border)] rounded">
                  {(selectedObject?.fields ?? []).map((field) => (
                    <label key={field.key} className="flex items-center gap-2 text-sm px-2 py-1">
                      <input
                        type="checkbox"
                        checked={ruleForm.fields.includes(field.key)}
                        onChange={() => handleFieldToggle(field.key)}
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Interval (minutes)"
                  type="number"
                  min={5}
                  value={ruleForm.intervalMinutes ?? 60}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, intervalMinutes: Number(e.target.value) }))}
                />
                <label className="block text-sm text-[var(--muted)]">
                  Sync behavior
                  <select
                    className={SELECT_STYLES}
                    value={ruleForm.syncBehavior}
                    onChange={(e) => setRuleForm((prev) => ({ ...prev, syncBehavior: e.target.value as IntegrationRuleConfig['syncBehavior'] }))}
                  >
                    <option value="delta">Delta</option>
                    <option value="full">Full</option>
                  </select>
                </label>
                <label className="block text-sm text-[var(--muted)]">
                  Conflict policy
                  <select
                    className={SELECT_STYLES}
                    value={ruleForm.conflictPolicy}
                    onChange={(e) => setRuleForm((prev) => ({ ...prev, conflictPolicy: e.target.value as IntegrationRuleConfig['conflictPolicy'] }))}
                  >
                    <option value="upsert">Upsert</option>
                    <option value="skip">Skip</option>
                  </select>
                </label>
                <label className="block text-sm text-[var(--muted)]">
                  Deletion policy
                  <select
                    className={SELECT_STYLES}
                    value={ruleForm.deletionPolicy}
                    onChange={(e) => setRuleForm((prev) => ({ ...prev, deletionPolicy: e.target.value as IntegrationRuleConfig['deletionPolicy'] }))}
                  >
                    <option value="mark_inactive_keep_link">Mark inactive & keep link</option>
                    <option value="ignore">Ignore deletions</option>
                    <option value="soft_delete">Soft delete</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!ruleForm.includeSubprojects}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, includeSubprojects: e.target.checked }))}
                  disabled={selectedProvider?.key === 'bqe'}
                />
                Include subprojects (disabled for BQE to enforce parent-only imports)
              </label>
              <label className="block text-sm text-[var(--muted)]">
                Initial sync mode
                <select
                  className={SELECT_STYLES}
                  value={ruleForm.initialSyncMode}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, initialSyncMode: e.target.value as IntegrationRuleConfig['initialSyncMode'] }))}
                >
                  <option value="full_once">Full once</option>
                  <option value="delta_only_after_date">Delta after date</option>
                  <option value="delta_only_from_now">Delta from now</option>
                </select>
              </label>
              {ruleForm.initialSyncMode === 'delta_only_after_date' && (
                <Input
                  label="Initial sync since (ISO date)"
                  type="datetime-local"
                  value={ruleForm.initialSyncSince ?? ''}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, initialSyncSince: e.target.value }))}
                />
              )}
              <label className="block text-sm text-[var(--muted)]">
                Client sync policy
                <select
                  className={SELECT_STYLES}
                  value={ruleForm.clientSyncPolicy}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, clientSyncPolicy: e.target.value as IntegrationRuleConfig['clientSyncPolicy'] }))}
                >
                  {clientPolicyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-[var(--muted)]">
                BQE Client values populate <code>bqe_client_name</code>; Local Client is stored in <code>project.client</code>. Use the policy above to decide when Local Client should mirror BQE.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!ruleForm.dryRun}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, dryRun: e.target.checked }))}
                />
                Dry-run (fetch and map without writing changes)
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => saveRuleMutation.mutate()}
                  disabled={ruleForm.fields.length === 0 || saveRuleMutation.isPending}
                >
                  {activeRule ? 'Update Rule' : 'Create Rule'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRuleForm((prev) => ({ ...prev, clientSyncPolicy: 'follow_bqe' }));
                    showToast('Client sync policy set to follow BQE. Save the rule to apply.', 'info');
                  }}
                >
                  Reset Local Client to BQE
                </Button>
              </div>
            </div>
            <div className="border border-[var(--border)] rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold text-[var(--text)]">Field Mapping</h4>
                  <p className="text-sm text-[var(--muted)]">Map provider fields to local targets.</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (mappingState?.defaults) {
                      setMappingDraft(mappingState.defaults.map((entry) => ({ ...entry })));
                    }
                  }}
                  disabled={!mappingState?.defaults}
                >
                  Reset to defaults
                </Button>
              </div>
              {mappingQuery.isLoading ? (
                <Loader inline message="Loading mapping..." />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_1fr_140px] gap-2 text-sm font-semibold text-[var(--muted)]">
                    <span>Provider Field</span>
                    <span>Target Field</span>
                    <span>Behavior</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {mappingDraft.map((entry, idx) => (
                      <div key={`${entry.source}-${idx}`} className="grid grid-cols-[1fr_1fr_140px] gap-2 items-center">
                        <input
                          className={`${SELECT_STYLES} text-sm`}
                          value={entry.source}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMappingDraft((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, source: val } : row)));
                          }}
                        />
                        <input
                          className={`${SELECT_STYLES} text-sm`}
                          value={entry.target}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMappingDraft((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, target: val } : row)));
                          }}
                        />
                        <select
                          className={`${SELECT_STYLES} text-sm`}
                          value={entry.behavior || 'follow_bqe'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMappingDraft((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, behavior: val } : row)));
                          }}
                        >
                          {behaviorOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {mappingDraft.length === 0 && (
                    <p className="text-sm text-[var(--muted)]">No mapping rows available for this object.</p>
                  )}
                  {mappingState?.stale && (
                    <div className="text-xs text-amber-200 border border-amber-500 bg-amber-500/10 rounded px-3 py-2">
                      Mapping overrides are outdated compared to the latest schema. Review and save to acknowledge.
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveMappingMutation.mutate()}
                      disabled={saveMappingMutation.isPending || syncDisabled || !mappingDraft.length || !mappingIsDirty}
                    >
                      Save Mapping
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMappingDraft((prev) => [...prev, { source: '', target: '', behavior: 'follow_bqe' }])}
                    >
                      Add Row
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">
                Use mapping behaviors to keep track of BQE Client (<code>bqe_client_name</code>) vs Local Client (<code>client</code>) fields.
              </p>
            </div>
          </div>

          <div className="border border-[var(--border)] rounded-lg p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold text-[var(--text)]">Sync Controls</h4>
                <p className="text-sm text-[var(--muted)]">Monitor last run, next schedule, and job history.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => jobsQuery.refetch()}
                >
                  Refresh Jobs
                </Button>
                <Button
                  size="sm"
                  onClick={() => setResyncModalOpen(true)}
                  disabled={!activeRule || syncDisabled}
                >
                  Post-restore Resync
                </Button>
              </div>
            </div>
            {activeRule ? (
              <div className="grid gap-3 md:grid-cols-3 text-sm">
                <div className="p-3 rounded border border-[var(--border)]">
                  <div className="text-[var(--muted)]">Last run</div>
                  <div className="font-semibold text-[var(--text)]">{formatDate(activeRule.last_run_at)}</div>
                </div>
                <div className="p-3 rounded border border-[var(--border)]">
                  <div className="text-[var(--muted)]">Last success</div>
                  <div className="font-semibold text-[var(--text)]">{formatDate(activeRule.last_success_at)}</div>
                </div>
                <div className="p-3 rounded border border-[var(--border)]">
                  <div className="text-[var(--muted)]">Next scheduled run</div>
                  <div className="font-semibold text-[var(--text)]">{formatDate(activeRule.next_run_at)}</div>
                </div>
              </div>
            ) : (
              <p className="text-[var(--muted)] text-sm">No rule yet for this object. Create one to enable scheduling.</p>
            )}
            {activeRule?.resync_required && (
              <div className="text-xs text-amber-200 border border-amber-500 bg-amber-500/10 rounded px-3 py-2">
                This rule requires a manual resync after a restore. Use “Post-restore Resync” to reset cursors.
              </div>
            )}
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Started</th>
                    <th className="py-2 pr-2">Finished</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 text-[var(--muted)]">
                        No jobs yet for this connection.
                      </td>
                    </tr>
                  )}
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b border-[var(--border)]">
                      <td className="py-2 pr-2">
                        <span className={clsx(
                          'px-2 py-1 rounded text-xs font-semibold uppercase',
                          job.status === 'succeeded' && 'bg-emerald-500/10 text-emerald-200 border border-emerald-500',
                          job.status === 'failed' && 'bg-red-500/10 text-red-200 border border-red-500',
                          job.status === 'running' && 'bg-blue-500/10 text-blue-200 border border-blue-500',
                          job.status === 'pending' && 'bg-[var(--surfaceHover)] text-[var(--muted)] border border-[var(--border)]'
                        )}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-2 pr-2">{formatDate(job.started_at)}</td>
                      <td className="py-2 pr-2">{formatDate(job.finished_at)}</td>
                      <td className="py-2">
                        {job.logs?.length ? (
                          <details>
                            <summary className="cursor-pointer text-[var(--primary)]">View log ({job.logs.length})</summary>
                            <pre className="text-xs whitespace-pre-wrap bg-[var(--surface)] border border-[var(--border)] rounded p-2 mt-1 max-h-40 overflow-auto">
                              {JSON.stringify(job.logs[job.logs.length - 1], null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="border border-[var(--border)] rounded-lg p-4 text-[var(--muted)]">
          Connect to a provider to configure rules and mappings.
        </div>
      )}

      <Modal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        title="Connect Provider"
        width={480}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createConnectionMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Company ID"
            required
            value={connectForm.companyId}
            onChange={(e) => setConnectForm((prev) => ({ ...prev, companyId: e.target.value }))}
          />
          <label className="block text-sm text-[var(--muted)]">
            Environment
            <select
              className={SELECT_STYLES}
              value={connectForm.environment}
              onChange={(e) => setConnectForm((prev) => ({ ...prev, environment: e.target.value as ConnectFormState['environment'] }))}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </label>
          <p className="text-xs text-[var(--muted)]">
            OAuth tokens are stored securely via MultiFernet. Use sandbox for testing; production enforces stricter rate limits.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setConnectModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!connectForm.companyId || connecting}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={resyncModalOpen}
        onClose={() => setResyncModalOpen(false)}
        title="Post-restore Resync"
        width={520}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            resyncMutation.mutate();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-[var(--muted)]">
            After a database restore, run a targeted resync to reset high-water marks before background schedules resume.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              value="delta_from_now"
              checked={resyncScope === 'delta_from_now'}
              onChange={() => setResyncScope('delta_from_now')}
            />
            Resume from now (delta-only). Recommended once tokens are valid again.
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              value="full"
              checked={resyncScope === 'full'}
              onChange={() => setResyncScope('full')}
            />
            Run a full backfill before the next scheduled delta.
          </label>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setResyncModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!activeRule || resyncMutation.isPending || syncDisabled}
            >
              {resyncMutation.isPending ? 'Queuing…' : 'Start Resync'}
            </Button>
          </div>
        </form>
      </Modal>
    </SettingsSectionFrame>
  );
};

export default IntegrationsSection;
