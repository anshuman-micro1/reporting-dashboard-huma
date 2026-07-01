'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import DateRangePicker from '@/components/DateRangePicker';
import LeaderboardTable from '../../components/leaderboard/LeaderboardTable';
import { Button } from '../../components/ui/Button';

interface LeaderboardRow {
  rank: number;
  memberName: string;
  hdm: string | null;
  totalSeconds: number;
  totalFormatted: string;
  totalFinalTaskCount: number | null;
}

function defaultDateRange(): { from: string; to: string } {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(yesterday);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const fmtLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: fmtLocal(weekAgo), to: fmtLocal(yesterday) };
}

const DEFAULT_RANGE = defaultDateRange();

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [dateFrom, setDateFrom] = useState(DEFAULT_RANGE.from);
  const [dateTo, setDateTo]     = useState(DEFAULT_RANGE.to);
  const [rows, setRows]         = useState<LeaderboardRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');

  const [uploadFile, setUploadFile]     = useState<File | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError]   = useState('');

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    if (dateFrom > dateTo) return;
    setLoading(true);
    setLoadError('');
    fetch(`/api/leaderboard?from=${dateFrom}&to=${dateTo}`)
      .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t); });
        return r.json() as Promise<LeaderboardRow[]>;
      })
      .then(data => setRows(data))
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  async function handleTaskUpload() {
    if (!uploadFile) { setUploadError('Choose a file first.'); return; }
    setUploading(true); setUploadError(''); setUploadMessage('');
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      const res = await fetch('/api/leaderboard/upload-tasks', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
      setUploadMessage(`Done — upserted: ${data.upserted}, modified: ${data.modified}${data.skipped > 0 ? `, skipped: ${data.skipped}` : ''}.`);
      setUploadFile(null);
      // Refresh leaderboard to reflect updated counts
      const r2 = await fetch(`/api/leaderboard?from=${dateFrom}&to=${dateTo}`);
      if (r2.ok) setRows(await r2.json());
    } catch (e: unknown) { setUploadError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setUploading(false); }
  }

  const periodDays = (() => {
    if (!dateFrom || !dateTo) return 0;
    const d1 = new Date(dateFrom + 'T00:00:00');
    const d2 = new Date(dateTo + 'T00:00:00');
    return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
  })();

  return (
    <>
      <header>
        <div className="logo">
          <div className="logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          Leaderboard
        </div>
        <div className="header-right">
          <Link href="/">
            <Button variant="ghost">← Dashboard</Button>
          </Link>
        </div>
      </header>

      <main>
        <div className="stats">
          <div className="stat-card">
            <div className="label">Date Range</div>
            <div className="value sm">
              {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : '—'}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Top Experts</div>
            <div className="value">{loading ? '—' : rows.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Period Days</div>
            <div className="value">{loading ? '—' : periodDays}</div>
          </div>
        </div>

        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />

        {isAdmin && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 18 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Upload Task Counts (CSV: expert_email, total_task)</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={e => { setUploadFile(e.target.files?.[0] || null); setUploadMessage(''); setUploadError(''); }}
                style={{ fontSize: 13 }}
              />
              <Button variant="secondary" onClick={handleTaskUpload} disabled={uploading || !uploadFile}>
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
              {uploadFile && <span style={{ fontSize: 12, color: 'var(--text)' }}>{uploadFile.name}</span>}
            </div>
            {uploadMessage && <div style={{ color: '#4ade80', marginTop: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>{uploadMessage}</div>}
            {uploadError   && <div style={{ color: '#f87171', marginTop: 8, fontSize: 13 }}>{uploadError}</div>}
          </div>
        )}

        <LeaderboardTable rows={rows} loading={loading} loadError={loadError} />
      </main>
    </>
  );
}
