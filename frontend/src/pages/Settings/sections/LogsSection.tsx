import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import { authApi, projectsApi } from '@/services/api';
import { useSettingsData } from '../SettingsDataContext';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { isAdminOrManager } from '@/utils/roleAccess';

type AdminAuditLogEntry = {
  id: number;
  action: string;
  created_at: string;
  detail: any;
  actor?: { username?: string };
  targetUser?: { username?: string };
};

type ProjectAuditLogEntry = {
  id: number;
  action: string;
  created_at: string;
  detail: any;
  actor?: { username?: string };
};

type LogTabKey = 'admin' | 'project';

// Keep project-audit-log id for server compatibility and manager visibility.
export const LOGS_SECTION_ID = 'project-audit-log';

const LogsSection: React.FC = () => {
  const { auth } = useSettingsData();
  const isAdmin = !!auth.user?.is_staff;
  const canAccess = isAdminOrManager(auth.user);
  const [activeTab, setActiveTab] = useState<LogTabKey>(isAdmin ? 'admin' : 'project');
  const [adminAudit, setAdminAudit] = useState<AdminAuditLogEntry[]>([]);
  const [projectAudit, setProjectAudit] = useState<ProjectAuditLogEntry[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin && activeTab === 'admin') {
      setActiveTab('project');
    }
  }, [activeTab, isAdmin]);

  const loadAdminAudit = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setAdminLoading(true);
      const logs = await authApi.listAdminAudit(100);
      setAdminAudit(logs || []);
    } catch {
      // ignore
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin]);

  const loadProjectAudit = useCallback(async () => {
    if (!canAccess) return;
    try {
      setProjectLoading(true);
      const logs = await projectsApi.listProjectAudit(100);
      setProjectAudit(logs || []);
    } catch {
      // ignore
    } finally {
      setProjectLoading(false);
    }
  }, [canAccess]);

  useAuthenticatedEffect(() => {
    if (!auth.accessToken || !canAccess) return;
    if (isAdmin) {
      void Promise.all([loadAdminAudit(), loadProjectAudit()]);
      return;
    }
    void loadProjectAudit();
  }, [auth.accessToken, canAccess, isAdmin, loadAdminAudit, loadProjectAudit]);

  if (!canAccess) return null;

  const tabs = useMemo(() => {
    const available: Array<{ key: LogTabKey; label: string }> = [{ key: 'project', label: 'Project Audit Log' }];
    if (isAdmin) {
      available.unshift({ key: 'admin', label: 'Admin Audit Log' });
    }
    return available;
  }, [isAdmin]);

  const renderDetail = (detail: any) => {
    try {
      return JSON.stringify(detail || {}, null, 0);
    } catch {
      return String(detail || '');
    }
  };

  const renderProjectAction = (action: string) => {
    switch (action) {
      case 'create_project':
        return 'Created';
      case 'delete_project':
        return 'Deleted';
      default:
        return action;
    }
  };

  return (
    <SettingsSectionFrame
      id={LOGS_SECTION_ID}
      title="Logs"
      className="mt-6"
      actions={(
        <Button
          variant="secondary"
          onClick={() => {
            if (activeTab === 'admin') {
              void loadAdminAudit();
              return;
            }
            void loadProjectAudit();
          }}
        >
          Refresh
        </Button>
      )}
    >
      <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              className={`rounded px-3 py-1.5 text-sm border ${
                isActive
                  ? 'bg-[var(--surfaceHover)] border-[var(--primary)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
              }`}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'admin' ? (
        adminLoading ? (
          <div className="text-[var(--text)]">Loading...</div>
        ) : adminAudit.length === 0 ? (
          <div className="text-[var(--muted)]">No recent events.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2 pr-4">Detail</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text)]">
                {adminAudit.map((log) => (
                  <tr key={log.id} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4">{log.actor?.username || '—'}</td>
                    <td className="py-2 pr-4">{log.action}</td>
                    <td className="py-2 pr-4">{log.targetUser?.username || '—'}</td>
                    <td className="py-2 pr-4">
                      <code className="text-xs">{renderDetail(log.detail)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : projectLoading ? (
        <div className="text-[var(--text)]">Loading...</div>
      ) : projectAudit.length === 0 ? (
        <div className="text-[var(--muted)]">No recent events.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Project</th>
                <th className="py-2 pr-4">Detail</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text)]">
              {projectAudit.map((log) => {
                const project = log.detail?.project || {};
                const projectLabel = project.name
                  ? `${project.name}${project.projectNumber ? ` (${project.projectNumber})` : ''}`
                  : '—';
                const projectMeta = [project.status, project.client].filter(Boolean).join(' • ');
                return (
                  <tr key={log.id} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4">{log.actor?.username || '—'}</td>
                    <td className="py-2 pr-4">{renderProjectAction(log.action)}</td>
                    <td className="py-2 pr-4">
                      <div>{projectLabel}</div>
                      {projectMeta ? <div className="text-xs text-[var(--muted)]">{projectMeta}</div> : null}
                    </td>
                    <td className="py-2 pr-4">
                      <code className="text-xs">{renderDetail(log.detail)}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSectionFrame>
  );
};

export default LogsSection;
