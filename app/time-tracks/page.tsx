'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface ReportRow {
  memberName: string;
  personalEmail: string | null;
  micro1Email: string | null;
  hdm: string | null;
  dates: Record<string, string>;
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function toSecs(str: string): number {
  if (!str || str === '0:00:00') return 0;
  const p = str.split(':').map(Number);
  return p[0] * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
}

function fromSecs(s: number): string {
  if (!s) return '0:00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
}

const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();

type SortCol = 'name' | 'total';

function TimeTracksContent() {
  const searchParams = useSearchParams();

  const [rows, setRows]               = useState<ReportRow[]>([]);
  const [allDateCols, setAllDateCols] = useState<string[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dateFrom, setDateFrom]           = useState(searchParams.get('from') ?? '');
  const [dateTo, setDateTo]               = useState(searchParams.get('to') ?? '');
  const [sortCol, setSortCol]             = useState<SortCol>('name');
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('asc');

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.length >= 4 || value.length === 0) {
      searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetch('/api/reports')
      .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t); });
        return r.json() as Promise<ReportRow[]>;
      })
      .then(data => {
        setRows(data);
        const dates = new Set<string>();
        data.forEach(r => r.dates && Object.keys(r.dates).forEach(d => dates.add(d)));
        setAllDateCols(Array.from(dates).sort());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, []);

  const visDateCols = allDateCols.filter(d => {
    if (dateFrom && d < dateFrom) return false;
    if (dateTo   && d > dateTo)   return false;
    return true;
  });

  const filteredRows = rows.filter(row => {
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      (row.memberName    ?? '').toLowerCase().includes(q) ||
      (row.personalEmail ?? '').toLowerCase().includes(q) ||
      (row.micro1Email   ?? '').toLowerCase().includes(q)
    );
  });

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sortedRows = [...filteredRows].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'name') {
      cmp = (a.memberName ?? '').localeCompare(b.memberName ?? '');
    } else {
      const totA = visDateCols.reduce((s, d) => s + toSecs(a.dates?.[d] ?? ''), 0);
      const totB = visDateCols.reduce((s, d) => s + toSecs(b.dates?.[d] ?? ''), 0);
      cmp = totA - totB;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortIcon = (col: SortCol) => (
    <span className={`sort-icon${sortCol === col ? ' active' : ''}`}>
      {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const rangeLabel = visDateCols.length
    ? `${visDateCols[0]} → ${visDateCols[visDateCols.length - 1]}`
    : '—';

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
          Time Tracks
        </div>
        <div className="header-right">
          <Link href="/" className="btn-secondary inv-nav-btn">← Dashboard</Link>
        </div>
      </header>

      <main>
        {/* Stats bar */}
        <div className="stats">
          <div className="stat-card">
            <div className="label">Experts</div>
            <div className="value">{loading ? '—' : filteredRows.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Date Range</div>
            <div className="value sm">{loading ? '—' : rangeLabel}</div>
          </div>
          <div className="stat-card">
            <div className="label">Days Shown</div>
            <div className="value">{loading ? '—' : visDateCols.length}</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name or email (min 4 chars)…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>

          <div className="date-range">
            <label>From</label>
            <input type="date" value={dateFrom} max={YESTERDAY} onChange={e => setDateFrom(e.target.value)} />
            <span className="sep">→</span>
            <label>To</label>
            <input type="date" value={dateTo} max={YESTERDAY} onChange={e => setDateTo(e.target.value)} />
          </div>

          {(dateFrom || dateTo) && (
            <div className="range-tag show">
              <span>{dateFrom || '…'} → {dateTo || '…'}</span>
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} title="Clear">✕</button>
            </div>
          )}

          <div className="toolbar-spacer" />
          <span className="result-count">
            {!loading && `${filteredRows.length} expert${filteredRows.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="col-name th-sortable" onClick={() => handleSort('name')}>
                  Expert{sortIcon('name')}
                </th>
                <th className="col-pemail">Personal Email</th>
                <th className="col-memail">Micro1 Email</th>
                <th className="col-hdm">HDM</th>
                <th className="col-total th-total th-sortable" onClick={() => handleSort('total')}>
                  Total{sortIcon('total')}
                </th>
                {[...visDateCols].reverse().map(d => {
                  const dt = new Date(d + 'T00:00:00');
                  return (
                    <th key={d} className="date-th" title={d}>
                      <span className="dow">{DOW[dt.getDay()]}</span>
                      <span className="dom">{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="state-row">
                  <td colSpan={5 + visDateCols.length}><span className="spinner" />Loading…</td>
                </tr>
              ) : error ? (
                <tr className="state-row">
                  <td colSpan={5 + visDateCols.length} style={{ color: '#f87171' }}>Error: {error}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr className="state-row">
                  <td colSpan={5 + visDateCols.length}>No records found</td>
                </tr>
              ) : (
                sortedRows.map(row => {
                  const totalSecs = visDateCols.reduce((s, d) => s + toSecs(row.dates?.[d] ?? ''), 0);
                  const total = fromSecs(totalSecs);
                  return (
                    <tr key={row.memberName} data-member={row.memberName ?? ''}>
                      <td className="col-name">{row.memberName || '—'}</td>
                      <td className="col-pemail dim">{row.personalEmail || '—'}</td>
                      <td className="col-memail dim">{row.micro1Email || '—'}</td>
                      <td className="col-hdm dim">{row.hdm || '—'}</td>
                      <td
                        className="col-total time-cell"
                        style={total === '0:00:00' ? { opacity: 0.35 } : undefined}
                      >
                        {total}
                      </td>
                      {[...visDateCols].reverse().map(d => {
                        const val = row.dates?.[d] || '0:00:00';
                        return (
                          <td key={d} className={val === '0:00:00' ? 'time-cell zero-time' : 'time-cell'}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

export default function TimeTracksPage() {
  return (
    <Suspense fallback={null}>
      <TimeTracksContent />
    </Suspense>
  );
}
