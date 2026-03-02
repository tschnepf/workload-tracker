import React, { useMemo, useRef, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import PageState from '@/components/ui/PageState';
import ForecastChartsSection from '@/components/reports/ForecastChartsSection';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { getFlag } from '@/lib/flags';
import { reportsApi } from '@/services/api';
import type {
  ForecastPlannerBootstrapResponse,
  ForecastPlannerProjectInput,
  ForecastPlannerResult,
  ForecastPlannerScenario,
  ForecastPlannerThresholds,
} from '@/types/models';
import { useLocation } from 'react-router';

const DEFAULT_THRESHOLDS: ForecastPlannerThresholds = {
  teamUtilizationPct: 95,
  roleUtilizationPct: 100,
  unmappedHoursPerWeek: 20,
};

const emptyProject = (): ForecastPlannerProjectInput => ({
  templateId: 0,
  name: '',
  startDate: new Date().toISOString().slice(0, 10),
  probabilityPct: 100,
  quantity: 1,
});

const ForecastPlannerPage: React.FC = () => {
  const location = useLocation();
  const [weeks, setWeeks] = useState<number>(26);
  const [department, setDepartment] = useState<number | null>(null);
  const [includeChildren, setIncludeChildren] = useState<boolean>(false);
  const [vertical] = useState<number | null>(null);
  const [statusKeys, setStatusKeys] = useState<string[]>([]);
  const [projects, setProjects] = useState<ForecastPlannerProjectInput[]>([]);
  const [thresholds, setThresholds] = useState<ForecastPlannerThresholds>(DEFAULT_THRESHOLDS);
  const [useProbabilityWeighting, setUseProbabilityWeighting] = useState<boolean>(false);
  const [bootstrap, setBootstrap] = useState<ForecastPlannerBootstrapResponse | null>(null);
  const [result, setResult] = useState<ForecastPlannerResult | null>(null);
  const [scenarios, setScenarios] = useState<ForecastPlannerScenario[]>([]);
  const [scenarioName, setScenarioName] = useState<string>('Executive Scenario');
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const initializedStatusesRef = useRef(false);

  const loadScenarios = React.useCallback(async () => {
    const payload = await reportsApi.listForecastScenarios();
    setScenarios(payload.results || []);
  }, []);

  const loadBootstrap = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await reportsApi.getForecastPlannerBootstrap({
        weeks,
        department,
        include_children: department != null ? (includeChildren ? 1 : 0) : 0,
        vertical,
      });
      setBootstrap(payload);
      if (!initializedStatusesRef.current) {
        setStatusKeys(payload.defaultIncludedStatusKeys || []);
        setResult(payload.baselineEvaluation || null);
        initializedStatusesRef.current = true;
      }
      await loadScenarios();
    } catch (e: any) {
      setError(e?.message || 'Failed to load forecast planner bootstrap');
    } finally {
      setIsLoading(false);
    }
  }, [weeks, department, includeChildren, vertical, loadScenarios]);

  useAuthenticatedEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useAuthenticatedEffect(() => {
    const token = new URLSearchParams(location.search).get('share');
    if (!token) return;
    (async () => {
      try {
        const payload = await reportsApi.getSharedForecastScenario(token);
        const scenario = payload.scenario;
        applyScenario(scenario);
      } catch {
        // Ignore malformed/missing shared tokens in URL.
      }
    })();
  }, [location.search]);

  const applyScenario = (scenario: ForecastPlannerScenario) => {
    setSelectedScenarioId(scenario.id);
    setScenarioName(scenario.name || 'Executive Scenario');
    const cfg = scenario.scenarioConfig || {};
    setWeeks(cfg.weeks || 26);
    setDepartment(cfg.department ?? null);
    setIncludeChildren(Boolean(cfg.includeChildren));
    setStatusKeys((cfg.statusKeys || []).filter(Boolean));
    setProjects((cfg.projects || []).map((item) => ({
      templateId: Number(item.templateId || 0),
      name: item.name || '',
      startDate: item.startDate || new Date().toISOString().slice(0, 10),
      probabilityPct: item.probabilityPct ?? 100,
      quantity: item.quantity ?? 1,
    })));
    setThresholds({
      ...DEFAULT_THRESHOLDS,
      ...(cfg.thresholds || {}),
    });
    setUseProbabilityWeighting(Boolean(cfg.useProbabilityWeighting));
    if (scenario.lastResult) setResult(scenario.lastResult);
  };

  const runEvaluation = async () => {
    setIsEvaluating(true);
    setError(null);
    try {
      const payload = await reportsApi.evaluateForecastScenario({
        weeks,
        department,
        include_children: includeChildren,
        vertical,
        statusKeys,
        projects,
        thresholds,
        useProbabilityWeighting,
      });
      setResult(payload.result);
    } catch (e: any) {
      setError(e?.message || 'Failed to evaluate scenario');
    } finally {
      setIsEvaluating(false);
    }
  };

  const onSaveScenario = async () => {
    const config = {
      weeks,
      department,
      includeChildren,
      vertical,
      statusKeys,
      projects,
      thresholds,
      useProbabilityWeighting,
    };
    setIsSaving(true);
    setError(null);
    try {
      if (selectedScenarioId) {
        const updated = await reportsApi.updateForecastScenario(selectedScenarioId, {
          name: scenarioName,
          scenarioConfig: config,
          lastResult: result || undefined,
        });
        const next = updated.scenario;
        setSelectedScenarioId(next.id);
      } else {
        const created = await reportsApi.createForecastScenario({
          name: scenarioName,
          isShared: true,
          scenarioConfig: config,
          lastResult: result || undefined,
        });
        const next = created.scenario;
        setSelectedScenarioId(next.id);
      }
      await loadScenarios();
    } catch (e: any) {
      setError(e?.message || 'Failed to save scenario');
    } finally {
      setIsSaving(false);
    }
  };

  const onDeleteScenario = async () => {
    if (!selectedScenarioId) return;
    setIsSaving(true);
    setError(null);
    try {
      await reportsApi.deleteForecastScenario(selectedScenarioId);
      setSelectedScenarioId(null);
      setScenarioName('Executive Scenario');
      await loadScenarios();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete scenario');
    } finally {
      setIsSaving(false);
    }
  };

  const statusDefinitions = bootstrap?.statusDefinitions || [];
  const statusStats = (result?.statusStats || bootstrap?.baselineEvaluation?.statusStats || {}) as Record<string, { projectCount: number; hours: number }>;
  const recommendation = result?.recommendation;
  const showCharts = getFlag('FORECAST_PLANNER_CHARTS_V1', true);
  const peakTeamUtilization = useMemo(() => Math.max(...(result?.totals?.teamUtilization || [0])), [result?.totals?.teamUtilization]);
  const weeksPreview = useMemo(() => (result?.weekKeys || []).slice(0, 12), [result?.weekKeys]);

  if (isLoading && !bootstrap) {
    return (
      <Layout>
        <PageState isLoading loadingState={<div className="p-6 text-[var(--muted)]">Loading forecast planner...</div>} />
      </Layout>
    );
  }

  if (error && !bootstrap) {
    return (
      <Layout>
        <PageState error={error} onRetry={() => void loadBootstrap()} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="ux-page-shell space-y-6">
        <div className="ux-page-hero flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Forecast Planner</h1>
            <p className="text-[var(--muted)]">Executive go/no-go planning with status-driven baseline controls.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={() => void runEvaluation()} disabled={isEvaluating}>
              {isEvaluating ? 'Evaluating…' : 'Evaluate'}
            </button>
            <button className="btn btn-primary" onClick={() => void onSaveScenario()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Scenario'}
            </button>
          </div>
        </div>

        {error ? <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

        <Card className="ux-panel">
          <div className="p-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="text-sm">
              <div className="text-[var(--muted)] mb-1">Weeks</div>
              <select className="w-full rounded border border-[var(--border)] bg-[var(--card)] p-2" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {[8, 12, 16, 20, 26, 36, 52].map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <div className="text-[var(--muted)] mb-1">Department</div>
              <select className="w-full rounded border border-[var(--border)] bg-[var(--card)] p-2" value={department ?? ''} onChange={(e) => setDepartment(e.target.value ? Number(e.target.value) : null)}>
                <option value="">All Departments</option>
                {(bootstrap?.departments || []).map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm flex items-end pb-2">
              <input
                type="checkbox"
                className="mr-2"
                checked={includeChildren}
                onChange={(e) => setIncludeChildren(e.target.checked)}
                disabled={department == null}
              />
              Include child departments
            </label>
            <label className="text-sm">
              <div className="text-[var(--muted)] mb-1">Scenario</div>
              <select
                className="w-full rounded border border-[var(--border)] bg-[var(--card)] p-2"
                value={selectedScenarioId ?? ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setSelectedScenarioId(id);
                  const scenario = scenarios.find((item) => item.id === id);
                  if (scenario) applyScenario(scenario);
                }}
              >
                <option value="">New Scenario</option>
                {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
            </label>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="ux-panel lg:col-span-1">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[var(--text)]">Status Inclusion</h2>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setStatusKeys(bootstrap?.defaultIncludedStatusKeys || [])} className="underline text-[var(--muted)]">Reset</button>
                  <button onClick={() => setStatusKeys((bootstrap?.statusDefinitions || []).map((s) => s.key))} className="underline text-[var(--muted)]">All</button>
                  <button onClick={() => setStatusKeys([])} className="underline text-[var(--muted)]">Clear</button>
                </div>
              </div>
              <div className="space-y-2 max-h-[360px] overflow-auto">
                {statusDefinitions.map((item) => {
                  const checked = statusKeys.includes(item.key);
                  const stats = statusStats[item.key] || { projectCount: 0, hours: 0 };
                  return (
                    <label key={item.key} className="flex items-start justify-between rounded border border-[var(--border)] p-2 text-sm">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setStatusKeys((prev) => (
                            prev.includes(item.key) ? prev.filter((k) => k !== item.key) : [...prev, item.key]
                          ))}
                        />
                        <div>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-[var(--muted)] text-xs">{item.key}</div>
                        </div>
                      </div>
                      <div className="text-right text-xs text-[var(--muted)]">
                        <div>{stats.projectCount} projects</div>
                        <div>{Math.round(stats.hours)}h</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="ux-panel lg:col-span-2">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[var(--text)]">Proposed Projects</h2>
                <button className="btn btn-secondary" onClick={() => setProjects((prev) => [...prev, emptyProject()])}>Add Project</button>
              </div>
              {projects.length === 0 ? <div className="text-sm text-[var(--muted)]">No proposed projects yet.</div> : null}
              <div className="space-y-2">
                {projects.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 gap-2 rounded border border-[var(--border)] p-3 md:grid-cols-6">
                    <select
                      className="rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm md:col-span-2"
                      value={item.templateId || ''}
                      onChange={(e) => setProjects((prev) => prev.map((row, i) => i === index ? { ...row, templateId: Number(e.target.value || 0) } : row))}
                    >
                      <option value="">Select template</option>
                      {(bootstrap?.templates || []).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                    <input
                      className="rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm md:col-span-2"
                      placeholder="Project name"
                      value={item.name}
                      onChange={(e) => setProjects((prev) => prev.map((row, i) => i === index ? { ...row, name: e.target.value } : row))}
                    />
                    <input
                      type="date"
                      className="rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
                      value={item.startDate}
                      onChange={(e) => setProjects((prev) => prev.map((row, i) => i === index ? { ...row, startDate: e.target.value } : row))}
                    />
                    <button className="btn btn-secondary" onClick={() => setProjects((prev) => prev.filter((_, i) => i !== index))}>Remove</button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
                      value={item.probabilityPct ?? 100}
                      onChange={(e) => setProjects((prev) => prev.map((row, i) => i === index ? { ...row, probabilityPct: Number(e.target.value) } : row))}
                      placeholder="Probability %"
                    />
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
                      value={item.quantity ?? 1}
                      onChange={(e) => setProjects((prev) => prev.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) } : row))}
                      placeholder="Quantity"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <label className="text-xs">
                  Team Utilization %
                  <input type="number" className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] p-2" value={thresholds.teamUtilizationPct} onChange={(e) => setThresholds((prev) => ({ ...prev, teamUtilizationPct: Number(e.target.value) }))} />
                </label>
                <label className="text-xs">
                  Role Utilization %
                  <input type="number" className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] p-2" value={thresholds.roleUtilizationPct} onChange={(e) => setThresholds((prev) => ({ ...prev, roleUtilizationPct: Number(e.target.value) }))} />
                </label>
                <label className="text-xs">
                  Unmapped h/week
                  <input type="number" className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] p-2" value={thresholds.unmappedHoursPerWeek} onChange={(e) => setThresholds((prev) => ({ ...prev, unmappedHoursPerWeek: Number(e.target.value) }))} />
                </label>
                <label className="text-xs flex items-end pb-2">
                  <input type="checkbox" className="mr-2" checked={useProbabilityWeighting} onChange={(e) => setUseProbabilityWeighting(e.target.checked)} />
                  Apply probability weighting
                </label>
              </div>
            </div>
          </Card>
        </div>

        <Card className="ux-panel">
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--muted)]">Decision</div>
                <div className="text-xl font-semibold">{recommendation?.decision || 'N/A'}</div>
              </div>
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--muted)]">Peak Team Utilization</div>
                <div className="text-xl font-semibold">{Math.round(peakTeamUtilization)}%</div>
              </div>
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--muted)]">First Overloaded Week</div>
                <div className="text-xl font-semibold">{recommendation?.firstOverloadedWeek || 'None'}</div>
              </div>
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--muted)]">Bottleneck Roles</div>
                <div className="text-sm">{(recommendation?.bottleneckRoles || []).map((r) => r.roleName).join(', ') || 'None'}</div>
              </div>
            </div>
            <div className="text-sm text-[var(--muted)]">{(recommendation?.reasons || []).join(' ')}</div>
            {result?.startOptions?.length ? (
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--muted)] mb-2">Earliest Feasible Starts</div>
                <div className="space-y-1 text-sm">
                  {result.startOptions.map((opt, idx) => (
                    <div key={`${opt.templateId}-${idx}`} className="flex justify-between">
                      <span>{opt.name}</span>
                      <span className="text-[var(--muted)]">{opt.earliestFeasibleStartDate || 'No feasible start in horizon'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {showCharts ? <ForecastChartsSection result={result} statusDefinitions={statusDefinitions} /> : null}

        {weeksPreview.length ? (
          <Card className="ux-panel">
            <div className="p-4">
              <details>
                <summary className="cursor-pointer font-semibold">Timeline Table (First 12 Weeks)</summary>
                <div className="mt-3 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--muted)]">
                        <th className="pr-4 pb-2">Week</th>
                        <th className="pr-4 pb-2">Capacity</th>
                        <th className="pr-4 pb-2">Baseline</th>
                        <th className="pr-4 pb-2">Proposed</th>
                        <th className="pr-4 pb-2">Total</th>
                        <th className="pr-4 pb-2">Utilization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeksPreview.map((wk, idx) => (
                        <tr key={wk} className="border-t border-[var(--border)]">
                          <td className="pr-4 py-2">{wk}</td>
                          <td className="pr-4 py-2">{Math.round(result?.totals.teamCapacity[idx] || 0)}h</td>
                          <td className="pr-4 py-2">{Math.round(result?.totals.baselineDemand[idx] || 0)}h</td>
                          <td className="pr-4 py-2">{Math.round(result?.totals.proposedDemand[idx] || 0)}h</td>
                          <td className="pr-4 py-2">{Math.round(result?.totals.totalDemand[idx] || 0)}h</td>
                          <td className="pr-4 py-2">{Math.round(result?.totals.teamUtilization[idx] || 0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </Card>
        ) : null}

        <Card className="ux-panel">
          <div className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              className="rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm md:min-w-[320px]"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Scenario name"
            />
            <div className="flex items-center gap-2">
              <button className="btn btn-primary" onClick={() => void onSaveScenario()} disabled={isSaving}>
                {selectedScenarioId ? 'Update Scenario' : 'Save New Scenario'}
              </button>
              {selectedScenarioId ? <button className="btn btn-secondary" onClick={() => void onDeleteScenario()} disabled={isSaving}>Delete</button> : null}
              {selectedScenarioId ? (
                <button
                  className="btn btn-secondary"
                  onClick={async () => {
                    const scenario = scenarios.find((item) => item.id === selectedScenarioId);
                    if (scenario?.sharedToken) {
                      await navigator.clipboard.writeText(`${window.location.origin}/reports/forecast?share=${scenario.sharedToken}`);
                    }
                  }}
                >
                  Copy Share Link
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default ForecastPlannerPage;
