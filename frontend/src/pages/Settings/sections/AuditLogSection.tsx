import React, { useCallback, useState } from 'react';
import Button from '@/components/ui/Button';
import { authApi } from '@/services/api';
import { useSettingsData } from '../SettingsDataContext';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

type AuditLogEntry = {
  id: number;
  action: string;
  created_at: string;
  detail: any;
  actor?: { username?: string };
  targetUser?: { username?: string };
};

export const AUDIT_LOG_SECTION_ID = 'admin-audit-log';

const AuditLogSection: React.FC = () => {
  const { auth } = useSettingsData();
  const isAdmin = !!auth.user?.is_staff;
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadAudit = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setAuditLoading(true);
      const logs = await authApi.listAdminAudit(100);
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

  return (
    <SettingsSectionFrame
      id={AUDIT_LOG_SECTION_ID}
      title="Admin Audit Log"
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
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Detail</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text)]">
              {audit.map((log) => (
                <tr key={log.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4">{log.actor?.username || '—'}</td>
                  <td className="py-2 pr-4">{log.action}</td>
                  <td className="py-2 pr-4">{log.targetUser?.username || '—'}</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs">
                      {(() => { try { return JSON.stringify(log.detail || {}, null, 0); } catch { return String(log.detail || ''); } })()}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSectionFrame>
  );
};

export default AuditLogSection;
