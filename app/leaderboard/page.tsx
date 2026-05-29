'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DateRangePicker from '@/components/DateRangePicker';

interface LeaderboardRow {
  rank: number;
  memberName: string;
  hdm: string | null;
  totalSeconds: number;
  totalFormatted: string;
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
  const [dateFrom, setDateFrom] = useState(DEFAULT_RANGE.from);
  const [dateTo, setDateTo]     = useState(DEFAULT_RANGE.to);
  const [rows, setRows]         = useState<LeaderboardRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');

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
          <Link href="/" className="btn-secondary inv-nav-btn">
            ← Dashboard
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

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>#</th>
                <th>Expert</th>
                <th>HDM</th>
                <th style={{ textAlign: 'right', paddingRight: 20 }}>Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="state-row">
                  <td colSpan={4}>
                    <span className="spinner" />Loading…
                  </td>
                </tr>
              ) : loadError ? (
                <tr className="state-row">
                  <td colSpan={4} style={{ color: '#f87171' }}>Error: {loadError}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr className="state-row">
                  <td colSpan={4}>No activity recorded in this date range</td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.rank}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-dim)' }}>
                      {row.rank}
                    </td>
                    <td style={{ fontWeight: 600 }}>{row.memberName}</td>
                    <td className="dim">{row.hdm || '—'}</td>
                    <td className="time-cell" style={{ textAlign: 'right', paddingRight: 20 }}>
                      {row.totalFormatted}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
