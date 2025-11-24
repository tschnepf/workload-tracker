import { apiClient, authHeaders } from '@/api/client';
import { ApiError } from './api';

export type IntegrationProviderSummary = {
  key: string;
  displayName: string;
  schemaVersion: string;
  metadata: Record<string, unknown>;
};

export type IntegrationCatalogField = {
  key: string;
  label: string;
  type?: string;
  nullable?: boolean;
};

export type IntegrationCatalogObject = {
  key: string;
  label: string;
  capabilities?: Record<string, boolean>;
  fields?: IntegrationCatalogField[];
  fieldSignatureHash?: string;
  mapping?: {
    schemaVersion?: string;
    defaults?: IntegrationMappingEntry[];
  };
};

export type IntegrationProviderCatalog = {
  key: string;
  displayName: string;
  schemaVersion: string;
  rateLimits?: Record<string, unknown>;
  baseUrlVariants?: Record<string, string>;
  objects: IntegrationCatalogObject[];
};

export type IntegrationProviderCredentials = {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  configured: boolean;
};

export type IntegrationConnection = {
  id: number;
  provider: string;
  providerDisplayName: string;
  environment: 'production' | 'sandbox';
  is_active: boolean;
  needs_reauth: boolean;
  is_disabled: boolean;
  hasToken: boolean;
  utc_offset_minutes: number;
  extra_headers?: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type IntegrationConnectionTestResult = {
  ok: boolean;
  provider: string;
  environment: 'production' | 'sandbox';
  checkedAt: string;
  sampleCount: number;
  message?: string;
};

export type IntegrationOAuthStart = {
  authorizeUrl: string;
  state: string;
};

export type IntegrationRuleConfig = {
  objectKey: string;
  fields: string[];
  filters: Record<string, unknown>;
  intervalMinutes?: number;
  cronExpression?: string;
  syncBehavior: 'full' | 'delta';
  conflictPolicy: 'upsert' | 'skip';
  deletionPolicy: 'mark_inactive_keep_link' | 'ignore' | 'soft_delete';
  includeSubprojects?: boolean;
  initialSyncMode: 'full_once' | 'delta_only_after_date' | 'delta_only_from_now';
  initialSyncSince?: string;
  clientSyncPolicy: 'preserve_local' | 'follow_bqe' | 'write_once';
  dryRun?: boolean;
};

export type IntegrationRule = {
  id: number;
  connection: number;
  object_key: string;
  config: IntegrationRuleConfig;
  is_enabled: boolean;
  revision: number;
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string;
  resync_required: boolean;
  created_at: string;
  updated_at: string;
};

export type IntegrationMappingEntry = {
  source: string;
  target: string;
  behavior?: string;
};

export type IntegrationMappingState = {
  schemaVersion?: string;
  defaults: IntegrationMappingEntry[];
  fieldSignatureHash?: string;
  overrides: {
    version?: string;
    fieldSignatureHash?: string;
    mappings: IntegrationMappingEntry[];
  } | null;
  stale: boolean;
};

export type IntegrationJob = {
  id: number;
  connection: number;
  provider: string;
  providerDisplayName: string;
  connectionCompany: string;
  connectionEnvironment: 'production' | 'sandbox';
  object_key: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  payload: Record<string, unknown>;
  logs: Array<Record<string, unknown>>;
  metrics: Record<string, number>;
  celery_id: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationHealth = {
  healthy: boolean;
  workersAvailable: boolean;
  cacheAvailable: boolean;
  schedulerPaused: boolean;
  message?: string | null;
  jobs: {
    running: number;
    lastJobAt: string | null;
    lastFailureAt: string | null;
    recent: {
      windowHours: number;
      total: number;
      succeeded: number;
      failed: number;
      successRate: number | null;
      itemsProcessed: number;
    };
  };
};

export type IntegrationResyncResponse = {
  rule: IntegrationRule;
  state: Record<string, unknown>;
};

type ApiResult<T> = { data?: T; response?: Response; error?: unknown };

function ensureData<T>(res: ApiResult<T>, entity: string): T {
  if (!res.data) {
    const status = res.response?.status ?? 500;
    throw new ApiError(`${entity} request failed`, status, res.error);
  }
  return res.data as T;
}

function coerceList<T>(value: any, entity: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && Array.isArray(value.results)) return value.results as T[];
  throw new ApiError(`${entity} response is not a list`, 500, value);
}

export async function listProviders(): Promise<IntegrationProviderSummary[]> {
  const res = await apiClient.GET('/integrations/providers/' as any, { headers: authHeaders() });
  return ensureData<IntegrationProviderSummary[]>(res, 'Providers');
}

export async function getProviderCatalog(key: string): Promise<IntegrationProviderCatalog> {
  const res = await apiClient.GET('/integrations/providers/{key}/catalog/' as any, {
    params: { path: { key } },
    headers: authHeaders(),
  });
  return ensureData<IntegrationProviderCatalog>(res, 'Provider catalog');
}

export async function getProviderCredentials(key: string): Promise<IntegrationProviderCredentials> {
  const res = await apiClient.GET('/integrations/providers/{key}/credentials/' as any, {
    params: { path: { key } },
    headers: authHeaders(),
  });
  return ensureData<IntegrationProviderCredentials>(res, 'Provider credentials');
}

export type SaveProviderCredentialsPayload = {
  clientId: string;
  redirectUri: string;
  clientSecret?: string;
};

export async function saveProviderCredentials(key: string, payload: SaveProviderCredentialsPayload): Promise<IntegrationProviderCredentials> {
  const res = await apiClient.POST('/integrations/providers/{key}/credentials/' as any, {
    params: { path: { key } },
    body: payload,
    headers: authHeaders(),
  });
  return ensureData<IntegrationProviderCredentials>(res, 'Save provider credentials');
}

export async function resetProvider(key: string): Promise<void> {
  const res = await apiClient.POST('/integrations/providers/{key}/reset/' as any, {
    params: { path: { key } },
    body: { confirm: true },
    headers: authHeaders(),
  });
  if (res.error) {
    const status = res.response?.status ?? 500;
    throw new ApiError('Provider reset failed', status, res.error);
  }
}

export async function testConnection(id: number): Promise<IntegrationConnectionTestResult> {
  const res = await apiClient.POST('/integrations/connections/{id}/test/' as any, {
    params: { path: { id } },
    headers: authHeaders(),
  });
  return ensureData<IntegrationConnectionTestResult>(res, 'Test connection');
}

export async function testActivityConnection(id: number): Promise<IntegrationConnectionTestResult> {
  const res = await apiClient.POST('/integrations/connections/{id}/test-activity/' as any, {
    params: { path: { id } },
    headers: authHeaders(),
  });
  return ensureData<IntegrationConnectionTestResult>(res, 'Test activity endpoint');
}

export async function listConnections(provider?: string): Promise<IntegrationConnection[]> {
  const res = await apiClient.GET('/integrations/connections/' as any, {
    params: provider ? { query: { provider } } : undefined,
    headers: authHeaders(),
  });
  const data = ensureData<any>(res, 'Connections');
  return coerceList<IntegrationConnection>(data, 'Connections');
}

export async function startConnectionOAuth(providerKey: string, connectionId: number): Promise<IntegrationOAuthStart> {
  const res = await apiClient.POST('/integrations/providers/{key}/connect/start/' as any, {
    params: { path: { key: providerKey } },
    body: { connectionId },
    headers: authHeaders(),
  });
  return ensureData<IntegrationOAuthStart>(res, 'Start OAuth');
}

export type CreateIntegrationConnectionPayload = {
  providerKey: string;
  environment?: 'production' | 'sandbox';
  extra_headers?: Record<string, string>;
  utc_offset_minutes?: number;
};

export async function createConnection(payload: CreateIntegrationConnectionPayload): Promise<IntegrationConnection> {
  const res = await apiClient.POST('/integrations/connections/' as any, {
    body: payload,
    headers: authHeaders(),
  });
  return ensureData<IntegrationConnection>(res, 'Create connection');
}

export type UpdateIntegrationConnectionPayload = Partial<Omit<IntegrationConnection, 'id' | 'provider' | 'providerDisplayName'>> & {
  providerKey?: string;
};

export async function updateConnection(id: number, payload: UpdateIntegrationConnectionPayload): Promise<IntegrationConnection> {
  const res = await apiClient.PATCH('/integrations/connections/{id}/' as any, {
    params: { path: { id } },
    body: payload,
    headers: authHeaders(),
  });
  return ensureData<IntegrationConnection>(res, 'Update connection');
}

export async function deleteConnection(id: number): Promise<void> {
  const res = await apiClient.DELETE('/integrations/connections/{id}/' as any, {
    params: { path: { id } },
    headers: authHeaders(),
  });
  if (res.error) {
    const status = res.response?.status ?? 500;
    throw new ApiError('Delete connection failed', status, res.error);
  }
}

export type ListRulesOptions = { connection?: number; provider?: string };

export async function listRules(opts?: ListRulesOptions): Promise<IntegrationRule[]> {
  const params: Record<string, string | number> = {};
  if (opts?.connection) params.connection = opts.connection;
  if (opts?.provider) params.provider = opts.provider;
  const res = await apiClient.GET('/integrations/rules/' as any, {
    params: { query: params },
    headers: authHeaders(),
  });
  const data = ensureData<any>(res, 'Rules');
  return coerceList<IntegrationRule>(data, 'Rules');
}

export type CreateRulePayload = {
  connection_id: number;
  object_key: string;
  config: IntegrationRuleConfig;
  is_enabled?: boolean;
};

export async function createRule(payload: CreateRulePayload): Promise<IntegrationRule> {
  const res = await apiClient.POST('/integrations/rules/' as any, {
    body: payload,
    headers: authHeaders(),
  });
  return ensureData<IntegrationRule>(res, 'Create rule');
}

export type UpdateRulePayload = Partial<CreateRulePayload>;

export async function updateRule(id: number, payload: UpdateRulePayload): Promise<IntegrationRule> {
  const res = await apiClient.PATCH('/integrations/rules/{id}/' as any, {
    params: { path: { id } },
    body: payload,
    headers: authHeaders(),
  });
  return ensureData<IntegrationRule>(res, 'Update rule');
}

export async function deleteRule(id: number): Promise<void> {
  const res = await apiClient.DELETE('/integrations/rules/{id}/' as any, {
    params: { path: { id } },
    headers: authHeaders(),
  });
  if (res.error) {
    const status = res.response?.status ?? 500;
    throw new ApiError('Delete rule failed', status, res.error);
  }
}

export async function getMappingDefaults(providerKey: string, objectKey: string, connectionId?: number): Promise<IntegrationMappingState> {
  const query: Record<string, number> = {};
  if (connectionId) query.connectionId = connectionId;
  const res = await apiClient.GET('/integrations/providers/{provider_key}/{object_key}/mapping/defaults/' as any, {
    params: { path: { provider_key: providerKey, object_key: objectKey }, query },
    headers: authHeaders(),
  });
  return ensureData<IntegrationMappingState>(res, 'Mapping defaults');
}

export type SaveMappingPayload = {
  providerKey: string;
  objectKey: string;
  connectionId: number;
  version?: string;
  mappings: IntegrationMappingEntry[];
};

export async function saveMapping(payload: SaveMappingPayload): Promise<IntegrationMappingState['overrides']> {
  const res = await apiClient.POST('/integrations/providers/{provider_key}/{object_key}/mapping/defaults/' as any, {
    params: { path: { provider_key: payload.providerKey, object_key: payload.objectKey } },
    body: {
      connectionId: payload.connectionId,
      version: payload.version,
      mappings: payload.mappings,
    },
    headers: authHeaders(),
  });
  return ensureData<IntegrationMappingState['overrides']>(res, 'Save mapping');
}

export type ListJobsOptions = {
  connection?: number;
  object?: string;
  limit?: number;
  status?: 'pending' | 'running' | 'succeeded' | 'failed';
};

export async function listJobs(providerKey: string, opts?: ListJobsOptions): Promise<IntegrationJob[]> {
  const query: Record<string, string | number> = {};
  if (opts?.connection) query.connection = opts.connection;
  if (opts?.object) query.object = opts.object;
  if (opts?.limit) query.limit = opts.limit;
  if (opts?.status) query.status = opts.status;
  const res = await apiClient.GET('/integrations/providers/{provider_key}/jobs/' as any, {
    params: {
      path: { provider_key: providerKey },
      query,
    },
    headers: authHeaders(),
  });
  const data = ensureData<{ items: IntegrationJob[] }>(res, 'Jobs');
  return data.items;
}

export async function retryJob(jobId: number): Promise<void> {
  const res = await apiClient.POST('/integrations/jobs/{id}/retry/' as any, {
    params: { path: { id: jobId } },
    headers: authHeaders(),
  });
  if (res.error) {
    const status = res.response?.status ?? 500;
    throw new ApiError('Retry job failed', status, res.error);
  }
}

export async function getHealth(): Promise<IntegrationHealth> {
  const res = await apiClient.GET('/integrations/health/' as any, { headers: authHeaders() });
  return ensureData<IntegrationHealth>(res, 'Integrations health');
}

export async function resyncRule(ruleId: number, scope: string): Promise<IntegrationResyncResponse> {
  const res = await apiClient.POST('/integrations/rules/{id}/resync/' as any, {
    params: { path: { id: ruleId } },
    body: { scope },
    headers: authHeaders(),
  });
  return ensureData<IntegrationResyncResponse>(res, 'Rule resync');
}

export type SecretKeyStatus = { configured: boolean };

export async function getSecretKeyStatus(): Promise<SecretKeyStatus> {
  const res = await apiClient.GET('/integrations/secret-key/' as any, { headers: authHeaders() });
  return ensureData<SecretKeyStatus>(res, 'Secret key status');
}

export async function setSecretKey(secretKey: string): Promise<SecretKeyStatus> {
  const res = await apiClient.POST('/integrations/secret-key/' as any, {
    body: { secretKey },
    headers: authHeaders(),
  });
  return ensureData<SecretKeyStatus>(res, 'Secret key update');
}

export type ProjectMatchCandidate = {
  id: number;
  name: string;
  client: string;
  projectNumber?: string | null;
};

export type ProjectMatchItem = {
  externalId: string;
  legacyExternalId?: string;
  externalName?: string;
  externalNumber?: string;
  externalClient?: string;
  status: string;
  matchReason?: string | null;
  matchedProject?: ProjectMatchCandidate | null;
  candidates: ProjectMatchCandidate[];
};

export type ProjectMatchResponse = {
  items: ProjectMatchItem[];
  summary: Record<string, number>;
  localProjects: ProjectMatchCandidate[];
};

export async function getProjectMatchSuggestions(connectionId: number, providerKey: string): Promise<ProjectMatchResponse> {
  const res = await apiClient.GET('/integrations/providers/{provider_key}/projects/matching/suggestions/' as any, {
    params: { path: { provider_key: providerKey }, query: { connectionId } },
    headers: authHeaders(),
  });
  return ensureData<ProjectMatchResponse>(res, 'Project matching suggestions');
}

export type ConfirmProjectMatchPayload = {
  connectionId: number;
  matches: Array<{ externalId: string; legacyExternalId?: string; projectId: number }>;
  enableRule?: boolean;
};

export async function confirmProjectMatches(providerKey: string, payload: ConfirmProjectMatchPayload) {
  const res = await apiClient.POST('/integrations/providers/{provider_key}/projects/matching/confirm/' as any, {
    params: { path: { provider_key: providerKey } },
    body: payload,
    headers: authHeaders(),
  });
  return ensureData<Record<string, number>>(res, 'Project matching confirmation');
}
