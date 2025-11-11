import React from 'react';
import { authHeaders } from '@/api/client';
import { showToast } from '@/lib/toastBus';

async function fetchCalendarFeeds() {
  const res = await fetch('/api/core/calendar_feeds/', { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ deliverables_token: string; updated_at: string }>;
}

async function patchCalendarFeeds(payload: { deliverables_token?: string; regenerate?: boolean }) {
  const res = await fetch('/api/core/calendar_feeds/', {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ deliverables_token: string; updated_at: string }>;
}

export default function CalendarFeeds() {
  const [loading, setLoading] = React.useState(true);
  const [token, setToken] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const icsUrl = `${origin}/calendar/deliverables.ics?key=${encodeURIComponent(token || '')}`;

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await fetchCalendarFeeds();
        setToken(data.deliverables_token || '');
        setLastUpdated(data.updated_at || null);
      } catch (e: any) {
        showToast(e?.message || 'Failed to load calendar feeds', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = await patchCalendarFeeds({ deliverables_token: token });
      setToken(data.deliverables_token || '');
      setLastUpdated(data.updated_at || null);
      showToast('Token updated', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to save token', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    const ok = window.confirm('Regenerate token? Existing subscriptions will stop updating.');
    if (!ok) return;
    try {
      setSaving(true);
      const data = await patchCalendarFeeds({ regenerate: true });
      setToken(data.deliverables_token || '');
      setLastUpdated(data.updated_at || null);
      showToast('Token regenerated', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to regenerate', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(icsUrl);
      showToast('Copied URL to clipboard', 'success');
    } catch {
      showToast('Copy failed', 'error');
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-[var(--text)]">Calendar Feeds</h2>
        {lastUpdated && <div className="text-xs text-[var(--muted)]">Updated {new Date(lastUpdated).toLocaleString()}</div>}
      </div>
      <p className="text-[var(--muted)] text-sm mb-4">Read-only ICS feed for project deliverables (excludes pre-deliverables). Anyone with the URL can subscribe. Rotate the token to revoke access.</p>

      {loading ? (
        <div className="text-[var(--muted)]">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm text-[var(--muted)] mb-1">Deliverables Feed URL</label>
              <div className="flex gap-2">
                <input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)]" value={icsUrl} readOnly />
                <button className="px-3 py-2 text-sm rounded border border-[var(--border)] hover:bg-[var(--surfaceHover)]" onClick={handleCopy}>Copy</button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Token</label>
              <input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)]" value={token} onChange={e => setToken((e.target as HTMLInputElement).value)} />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button disabled={saving} className={`px-3 py-2 rounded ${saving ? 'opacity-50 cursor-not-allowed' : 'bg-[var(--primary)] text-white border border-[var(--primary)] hover:opacity-90'}`} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button disabled={saving} className="px-3 py-2 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]" onClick={handleRegenerate}>
              Regenerate Token
            </button>
          </div>

          <div className="mt-4 text-[var(--muted)] text-sm">
            <div>Outlook: Add calendar → Subscribe from web → paste URL.</div>
            <div>Google Calendar: Other calendars → From URL → paste URL.</div>
          </div>
        </>
      )}
    </div>
  );
}

