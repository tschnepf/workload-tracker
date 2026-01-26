import React, { useCallback, useState } from 'react';
import Button from '@/components/ui/Button';
import { projectsApi } from '@/services/api';
import { useSettingsData } from '../SettingsDataContext';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

type ProjectAuditLogEntry = {
  id: number;
  action: string;
  created_at: string;
  detail: any;
  actor?: { username?: string };
};

export const PROJECT_AUDIT_LOG_SECTION_ID = 'project-audit-log';

const ProjectAuditLogSection: React.FC = () => {
  const { auth } = useSettingsData();
  const isAdmin = !!auth.user?.is_staff;
  const [audit, setAudit] = useState<ProjectAuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadAudit = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setAuditLoading(true);
      const logs = await projectsApi.listProjectAudit(100);
      setAudit(logs || []);
    } catch {
      // ignore
    } finally {
      setAuditLoading(false);
    }
  }, [isAdmin]);

  useAuthenticatedEffect(() => {
    if (!auth.accessToken || !isAdmin) return;
    void loadAudit();
  }, [auth.accessToken, isAdmin, loadAudit]);

  if (!isAdmin) return null;

  const renderAction = (action: string) => {
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
      id={PROJECT_AUDIT_LOG_SECTION_ID}
      title="Project Audit Log"
      className="mt-6"
      actions={(
        <Button variant="secondary" onClick={() => void loadAudit()}>
          Refresh
        </Button>
      )}
    >
      {auditLoading ? (
        <div className="text-[var(--text)]">Loading...</div>
      ) : audit.length === 0 ? (
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
              {audit.map((log) => {
                const project = log.detail?.project || {};
                const projectLabel = project.name
                  ? `${project.name}${project.projectNumber ? ` (${project.projectNumber})` : ''}`
                  : '—';
                const projectMeta = [project.status, project.client].filter(Boolean).join(' • ');
                return (
                  <tr key={log.id} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4">{log.actor?.username || '—'}</td>
                    <td className="py-2 pr-4">{renderAction(log.action)}</td>
                    <td className="py-2 pr-4">
                      <div>{projectLabel}</div>
                      {projectMeta ? <div className="text-xs text-[var(--muted)]">{projectMeta}</div> : null}
                    </td>
                    <td className="py-2 pr-4">
                      <code className="text-xs">
                        {(() => { try { return JSON.stringify(log.detail || {}, null, 0); } catch { return String(log.detail || ''); } })()}
                      </code>
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

export default ProjectAuditLogSection;
