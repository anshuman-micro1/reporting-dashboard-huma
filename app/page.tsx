'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

interface QCTask {
  link: string;
  recordingLength: string;
  app: string;
}

interface ReportRow {
  memberName: string;
  personalEmail: string | null;
  micro1Email: string | null;
  organization: string;
  timezone: string;
  activity: string;
  hdm: string | null;
  team: string | null;
  dates: Record<string, string>;
  allTasks: Array<{ date: string; tasks: QCTask[] }>;
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

function computeTotal(row: ReportRow, cols: string[]): string {
  return fromSecs(cols.reduce((sum, d) => sum + toSecs(row.dates?.[d] ?? ''), 0));
}

function pillClass(pct: string): string {
  const n = parseInt(pct);
  if (isNaN(n)) return 'none';
  if (n >= 70) return 'high';
  if (n >= 40) return 'medium';
  return 'low';
}

function tasksInRange(row: ReportRow, from: string, to: string): number {
  if (!row.allTasks?.length) return 0;
  return row.allTasks
    .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
    .reduce((sum, e) => sum + (e.tasks?.length ?? 0), 0);
}

function appsInRange(row: ReportRow, from: string, to: string): string[] {
  if (!row.allTasks?.length) return [];
  const apps = new Set<string>();
  for (const e of row.allTasks) {
    if ((!from || e.date >= from) && (!to || e.date <= to)) {
      for (const t of e.tasks ?? []) { if (t.app) apps.add(t.app); }
    }
  }
  return Array.from(apps).sort();
}

function formatSnapshotDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function defaultDateRange(): { from: string; to: string } {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(yesterday);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(weekAgo), to: fmt(yesterday) };
}

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();


export default function Dashboard() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [allRows, setAllRows] = useState<ReportRow[]>([]);
  const [allDateCols, setAllDateCols] = useState<string[]>([]);
  const [masterDateCols, setMasterDateCols] = useState<string[]>([]);
  const [visDateCols, setVisDateCols] = useState<string[]>([]);
  const [rangeActive, setRangeActive] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [zeroDatesFrom, setZeroDatesFrom] = useState('');
  const [zeroDatesTo, setZeroDatesTo] = useState('');
  const [overHours, setOverHours] = useState(8);
  const [zeroPanelOpen, setZeroPanelOpen] = useState(false);
  const [overPanelOpen, setOverPanelOpen] = useState(false);
  const [invPanelOpen, setInvPanelOpen] = useState(false);
  const [offbPanelOpen, setOffbPanelOpen] = useState(false);
  const [multiAppPanelOpen, setMultiAppPanelOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [fetchDateFrom, setFetchDateFrom] = useState('');
  const [fetchDateTo, setFetchDateTo] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncDone, setSyncDone] = useState(false);
  const [dailyReport, setDailyReport] = useState<{
    total_time: string;
    average_activity: string;
    average_hours_per_member: string;
    member_data?: Record<string, { total_hours: string; activity: string }>;
  } | null>(null);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [copiedSnapshot, setCopiedSnapshot] = useState(false);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [sortCol, setSortCol] = useState<'name' | 'activity' | 'tasks' | 'total' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [huma2Filter, setHuma2Filter] = useState(true);
  const [selectedHDM, setSelectedHDM] = useState('');
  const [minTasks, setMinTasks] = useState(0);
  const [maxTasks, setMaxTasks] = useState(0);
  const [investigateModal, setInvestigateModal] = useState<{
    open: boolean; row: ReportRow | null; notes: string; saving: boolean; error: string;
  }>({ open: false, row: null, notes: '', saving: false, error: '' });
  const [investigatedNames, setInvestigatedNames] = useState<Set<string>>(new Set());
  const [offboardingStatusMap, setOffboardingStatusMap] = useState<Map<string, 'pending' | 'resolved'>>(new Map());
  const [offboardConfirmRow, setOffboardConfirmRow] = useState<ReportRow | null>(null);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });

  const tableWrapRef = useRef<HTMLDivElement>(null);
  const tableHeadRef = useRef<HTMLTableSectionElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);

  useEffect(() => { dateFromRef.current = dateFrom; }, [dateFrom]);
  useEffect(() => { dateToRef.current = dateTo; }, [dateTo]);

  // Recompute visDateCols when date filter or allDateCols change
  // Always use masterDateCols when available so search doesn't drop columns
  useEffect(() => {
    const source = masterDateCols.length ? masterDateCols : allDateCols;
    const visCols = source.filter(d => {
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
    setVisDateCols(visCols);
    setRangeActive(!!(dateFrom || dateTo));
  }, [dateFrom, dateTo, allDateCols, masterDateCols]);

  const refresh = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const url = '/api/reports' + (searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '');
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const rows: ReportRow[] = await res.json();

      const set = new Set<string>();
      rows.forEach(r => r.dates && Object.keys(r.dates).forEach(d => set.add(d)));
      const cols = Array.from(set).sort();

      setAllRows(rows);

      if (!searchTerm) {
        setMasterDateCols(cols);
        setAllDateCols(cols);
        if (cols.length > 0) {
          const def = defaultDateRange();
          setZeroDatesFrom(prev => prev || def.from);
          setZeroDatesTo(prev => prev || def.to);
        }
      } else {
        setAllDateCols(prev => prev.length ? prev : cols);
      }

    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh('');
  }, [refresh]);

  useEffect(() => {
    fetch('/api/investigations')
      .then(r => r.json())
      .then((data: { name: string; status: string }[]) => {
        setInvestigatedNames(new Set(data.filter(d => d.status === 'open').map(d => d.name)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/offboardings')
      .then(r => r.json())
      .then((data: { name: string; status: string }[]) => {
        setOffboardingStatusMap(new Map(
          data.map(d => [d.name, d.status as 'pending' | 'resolved'])
        ));
      })
      .catch(() => {});
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.length >= 4 || value.length === 0) {
      searchDebounceRef.current = setTimeout(() => refresh(value), 300);
    }
  };

  const scrollToMember = (memberName: string) => {
    const tableWrap = tableWrapRef.current;
    const tableHead = tableHeadRef.current;
    const tableBody = tableBodyRef.current;
    if (!tableWrap || !tableHead || !tableBody) return;

    tableBody.querySelectorAll('.row-highlight').forEach(r => r.classList.remove('row-highlight'));

    let target: HTMLTableRowElement | null = null;
    for (const tr of Array.from(tableBody.querySelectorAll('tr[data-member]')) as HTMLTableRowElement[]) {
      if (tr.dataset.member === memberName) { target = tr; break; }
    }
    if (!target) return;

    const theadH = tableHead.offsetHeight;
    const offset = target.getBoundingClientRect().top - tableWrap.getBoundingClientRect().top - theadH - 8;
    tableWrap.scrollBy({ top: offset, behavior: 'smooth' });
    tableWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    target.classList.add('row-highlight');
    target.addEventListener('animationend', () => target!.classList.remove('row-highlight'), { once: true });
  };

  const hdmNames = [...new Set(allRows.map(r => r.hdm).filter(Boolean) as string[])].sort();

  const filteredRows = allRows.filter(row => {
    if (huma2Filter && row.team !== 'huma2') return false;
    if (selectedHDM && row.hdm !== selectedHDM) return false;
    if (minTasks > 0 || maxTasks > 0) {
      const from = dateFrom || allDateCols[0] || '';
      const to   = dateTo   || allDateCols[allDateCols.length - 1] || '';
      const n = tasksInRange(row, from, to);
      if (minTasks > 0 && n < minTasks) return false;
      if (maxTasks > 0 && n > maxTasks) return false;
    }
    return true;
  });

  // Derived: zero-activity members
  const zeroMembers = (() => {
    const rangeCols = allDateCols.filter(d => (!zeroDatesFrom || d >= zeroDatesFrom) && (!zeroDatesTo || d <= zeroDatesTo));
    if (!rangeCols.length || !filteredRows.length) return [];
    return filteredRows.filter(row => rangeCols.every(d => toSecs(row.dates?.[d] ?? '') === 0));
  })();

  const exportZeroCSV = () => {
    const sorted = [...zeroMembers].sort((a, b) => (a.hdm ?? '').localeCompare(b.hdm ?? ''));
    const escape = (v: string | null) => {
      const s = v ?? '';
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      'Expert name,Personal Email,Micro1 Email,HDM',
      ...sorted.map(r => [r.memberName, r.personalEmail, r.micro1Email, r.hdm].map(escape).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `no-activity-experts-${TODAY}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derived: over-threshold members
  const overMembers = (() => {
    const rangeCols = allDateCols.filter(d => (!zeroDatesFrom || d >= zeroDatesFrom) && (!zeroDatesTo || d <= zeroDatesTo));
    const threshSecs = overHours * 3600;
    if (!rangeCols.length || !filteredRows.length || threshSecs <= 0) return [];
    return filteredRows
      .map(row => {
        let peakSecs = 0, peakDay = '';
        for (const d of rangeCols) {
          const s = toSecs(row.dates?.[d] ?? '');
          if (s > peakSecs) { peakSecs = s; peakDay = d; }
        }
        return { row, peakSecs, peakDay };
      })
      .filter(({ peakSecs }) => peakSecs > threshSecs)
      .sort((a, b) => b.peakSecs - a.peakSecs);
  })();

  // Derived: members currently under open investigation
  const investigatedMembers = filteredRows.filter(row => investigatedNames.has(row.memberName));

  // Derived: members with pending offboarding requests (shown in panel)
  const offboardingMembers = filteredRows.filter(row => offboardingStatusMap.get(row.memberName) === 'pending');

  // Derived: experts using more than one app in the selected date range
  const multiAppMembers = (() => {
    const from = dateFrom || allDateCols[0] || '';
    const to   = dateTo   || allDateCols[allDateCols.length - 1] || '';
    return filteredRows
      .map(row => ({ row, apps: appsInRange(row, from, to) }))
      .filter(({ apps }) => apps.length > 1);
  })();

  const handleFetch = async () => {
    setFetchLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateStart: fetchDateFrom, dateEnd: fetchDateTo }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setModalOpen(false);
      setFetchLoading(false);
      await refresh(search);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedDate) return;
    setDailyReport(null);
    setDailyReportLoading(true);
    setSyncDone(false);
    setSyncError('');
    fetch(`/api/daily_report?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => setDailyReport(data))
      .catch(() => setDailyReport(null))
      .finally(() => setDailyReportLoading(false));
  }, [selectedDate]);

  const handleSync = async () => {
    if (!selectedDate) return;
    setSyncLoading(true);
    setSyncError('');
    setSyncDone(false);
    try {
      const res = await fetch('/api/daily_report', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      // data is { 'YYYY-MM-DD': doc, ... } — update displayed stats if selected date is one of them
      if (selectedDate && data[selectedDate]) setDailyReport(data[selectedDate]);
      setSyncDone(true);
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleOffboard = async (row: ReportRow) => {
    setOffboardingStatusMap(prev => new Map(prev).set(row.memberName, 'pending'));
    try {
      const res = await fetch('/api/offboardings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.memberName, personalEmail: row.personalEmail, micro1Email: row.micro1Email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
    } catch {
      setOffboardingStatusMap(prev => { const m = new Map(prev); m.delete(row.memberName); return m; });
    }
  };

  const handleInvestigate = async () => {
    const { row, notes } = investigateModal;
    if (!row || !notes.trim()) return;
    setInvestigateModal(p => ({ ...p, saving: true, error: '' }));
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: row.memberName,
          personalEmail: row.personalEmail,
          micro1Email: row.micro1Email,
          notes: notes.trim(),
          investigationDate: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setInvestigatedNames(prev => new Set(prev).add(row.memberName));
      setInvestigateModal({ open: false, row: null, notes: '', saving: false, error: '' });
    } catch (err: unknown) {
      setInvestigateModal(p => ({ ...p, saving: false, error: err instanceof Error ? err.message : 'Unknown error' }));
    }
  };

  const handleSort = (col: 'name' | 'activity' | 'tasks' | 'total') => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortCol) return 0;
    let cmp = 0;
    if (sortCol === 'name') {
      cmp = (a.memberName || '').localeCompare(b.memberName || '');
    } else if (sortCol === 'tasks') {
      const from = dateFrom || allDateCols[0] || '';
      const to   = dateTo   || allDateCols[allDateCols.length - 1] || '';
      cmp = tasksInRange(a, from, to) - tasksInRange(b, from, to);
    } else if (sortCol === 'total') {
      cmp = toSecs(computeTotal(a, visDateCols)) - toSecs(computeTotal(b, visDateCols));
    } else {
      cmp = (parseInt(a.activity) || 0) - (parseInt(b.activity) || 0);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const rangeTagText = rangeActive
    ? `${dateFrom || allDateCols[0] || '…'} → ${dateTo || allDateCols[allDateCols.length - 1] || '…'}`
    : '';

  const statRange = visDateCols.length ? `${visDateCols[0]} → ${visDateCols[visDateCols.length - 1]}` : '—';
  const statOrg = allRows[0]?.organization || '—';

  const DISPLAY_DAYS = 7;
  const displayedDateCols = visDateCols.slice(-DISPLAY_DAYS);
  const hasMoreCols = visDateCols.length > DISPLAY_DAYS;
  const moreCount = visDateCols.length - DISPLAY_DAYS;
  const timeTracksHref = visDateCols.length
    ? `/time-tracks?from=${encodeURIComponent(visDateCols[0])}&to=${encodeURIComponent(visDateCols[visDateCols.length - 1])}`
    : '/time-tracks';


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
          Hubstaff Dashboard
        </div>
        <div className="header-right">
          {isAdmin && (
            <Link href="/users" className="btn-secondary inv-nav-btn">
              Users
            </Link>
          )}
          <Link href="/settings" className="btn-secondary inv-nav-btn">
            Settings
          </Link>
          <Link href="/members" className="btn-secondary inv-nav-btn">
            Update Experts
          </Link>
          <Link href="/offboardings" className="btn-secondary inv-nav-btn">
            Offboardings
          </Link>
          <Link href="/investigations" className="btn-secondary inv-nav-btn">
            Investigations
          </Link>
          <Link href="/leaderboard" className="btn-secondary inv-nav-btn">
            Leaderboard
          </Link>
          <button id="fetch-btn" onClick={() => { setFetchError(''); setModalOpen(true); }}>
            <img src="/icons8-hubstaff-240.png" width="16" height="16" alt="" style={{ borderRadius: 3 }} />
            Fetch Data
          </button>
          <button
            className="btn-secondary"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign out
          </button>
        </div>
      </header>

      <main>
        <div className="stats">
          <div className="stat-card">
            <div className="label">Experts</div>
            <div className="value">{loading ? '—' : allRows.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Showing Range</div>
            <div className="value sm">{loading ? '—' : statRange}</div>
          </div>
          <div className="stat-card">
            <div className="label">Visible Days</div>
            <div className="value">{loading ? '—' : visDateCols.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Organisation</div>
            <div className="value sm">{loading ? '—' : statOrg}</div>
          </div>

          <div className="stats-sep" />

          <div className="stat-card snapshot-card">
            <div className="snapshot-header">
              <div className="label">Daily Snapshot</div>
              <button
                className="snapshot-info-btn"
                title="View expert breakdown"
                disabled={!dailyReport || dailyReportLoading}
                onClick={() => setSnapshotModalOpen(true)}
              >i</button>
              <input type="date" value={selectedDate} max={YESTERDAY} onChange={e => setSelectedDate(e.target.value)} className="snapshot-date" />
            </div>
            <div className="snapshot-stats">
              <div className="snapshot-stat">
                <span className="ds-label">Total</span>
                <span className="ds-value">{dailyReportLoading ? '…' : (dailyReport?.total_time ?? '—')}</span>
              </div>
              <div className="snapshot-stat">
                <span className="ds-label">Avg / Expert</span>
                <span className="ds-value">{dailyReportLoading ? '…' : (dailyReport?.average_hours_per_member ?? '—')}</span>
              </div>
              <div className="snapshot-stat">
                <span className="ds-label">Avg Activity</span>
                <span className="ds-value">{dailyReportLoading ? '…' : (dailyReport?.average_activity ?? '—')}</span>
              </div>
              <button className="sync-btn" onClick={handleSync} disabled={syncLoading}>
                {syncLoading
                  ? <><span className="spinner" style={{ width: 11, height: 11, marginRight: 5 }} />Syncing…</>
                  : syncDone ? 'Synced ✓'
                  : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
                    </svg>Sync</>
                }
              </button>
            </div>
            {syncError && <span className="sync-error">{syncError}</span>}
          </div>
        </div>

        <div className="toolbar">
          <div className="input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name, personal email, micro1 email (min 4 chars)…"
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

          <div className={`range-tag${rangeActive ? ' show' : ''}`}>
            <span>{rangeTagText}</span>
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} title="Clear date filter">✕</button>
          </div>

          <div className="filter-group">
            <button
              className={`filter-btn${huma2Filter ? ' active' : ''}`}
              onClick={() => { setHuma2Filter(p => !p); setSelectedHDM(''); }}
            >
              huma2 team
            </button>
            <select
              className="hdm-select"
              value={selectedHDM}
              onChange={e => {
                setSelectedHDM(e.target.value);
                setHuma2Filter(!!e.target.value);
              }}
            >
              <option value="">All HDMs</option>
              {hdmNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="date-range">
            <label>Tasks</label>
            <input
              type="number"
              min={0}
              value={minTasks || ''}
              placeholder="Min"
              onChange={e => setMinTasks(Math.max(0, parseInt(e.target.value) || 0))}
            />
            <span className="sep">–</span>
            <input
              type="number"
              min={0}
              value={maxTasks || ''}
              placeholder="Max"
              onChange={e => setMaxTasks(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>

          <div className="toolbar-spacer" />
          <span className="result-count">
            {!loading && (
              (huma2Filter || selectedHDM || minTasks > 0 || maxTasks > 0)
                ? `${filteredRows.length} of ${allRows.length} expert${allRows.length !== 1 ? 's' : ''}`
                : `${allRows.length} expert${allRows.length !== 1 ? 's' : ''}`
            )}
          </span>
        </div>

        {/* Zero-activity panel */}
        {!loading && zeroMembers.length > 0 && (
          <div id="zero-panel">
            <div className="zero-header" onClick={() => setZeroPanelOpen(p => !p)}>
              <div className="zero-icon">⚠</div>
              <div className="zero-title">
                {zeroMembers.length} expert{zeroMembers.length > 1 ? 's' : ''} with no activity
              </div>
              <div className="zero-date-filter" id="zero-date-filter" onClick={e => e.stopPropagation()}>
                <label>From</label>
                <input type="date" value={zeroDatesFrom} max={YESTERDAY} onChange={e => setZeroDatesFrom(e.target.value)} />
                <span className="sep">→</span>
                <label>To</label>
                <input type="date" value={zeroDatesTo} max={YESTERDAY} onChange={e => setZeroDatesTo(e.target.value)} />
              </div>
              <button
                className="btn-secondary"
                onClick={e => { e.stopPropagation(); exportZeroCSV(); }}
                style={{ fontSize: 12, padding: '4px 10px', marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <img src="/icons8-excel-240.png" width="14" height="14" alt="" style={{ borderRadius: 2 }} />
                Export CSV
              </button>
              <div className={`zero-chevron${zeroPanelOpen ? ' open' : ''}`}>▼</div>
            </div>
            <div className={`zero-list-wrap${zeroPanelOpen ? ' open' : ''}`} style={{ display: zeroPanelOpen ? 'block' : 'none', padding: '0 16px 14px' }}>
              <div className="zero-grid">
                {zeroMembers.map(row => (
                  <div
                    key={row.memberName}
                    className="zero-member"
                    onClick={() => scrollToMember(row.memberName)}
                  >
                    <div className="zm-name">{row.memberName || '—'}</div>
                    <div className="zm-email">{row.micro1Email || row.personalEmail || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Over-threshold panel */}
        {!loading && overMembers.length > 0 && (
          <div id="over-panel">
            <div className="over-header" onClick={() => setOverPanelOpen(p => !p)}>
              <div className="over-icon">↑</div>
              <div className="over-title">
                {overMembers.length} expert{overMembers.length > 1 ? 's' : ''} over {overHours}h on a single day
              </div>
              <div className="over-hours-filter" id="over-hours-filter" onClick={e => e.stopPropagation()}>
                <label>Over</label>
                <input
                  type="number"
                  min={0} max={24} step={0.5}
                  value={overHours}
                  onChange={e => setOverHours(parseFloat(e.target.value) || 0)}
                />
                <span>hrs/day</span>
              </div>
              <div className={`over-chevron${overPanelOpen ? ' open' : ''}`}>▼</div>
            </div>
            <div style={{ display: overPanelOpen ? 'block' : 'none', padding: '0 16px 14px' }}>
              <div className="over-grid">
                {overMembers.map(({ row, peakSecs, peakDay }) => (
                  <div
                    key={row.memberName}
                    className="over-member"
                    onClick={() => scrollToMember(row.memberName)}
                  >
                    <div className="om-name">{row.memberName || '—'}</div>
                    <div className="om-peak">Peak: {peakDay} · {fromSecs(peakSecs)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Under investigation panel */}
        {!loading && investigatedMembers.length > 0 && (
          <div id="inv-panel">
            <div className="inv-panel-header" onClick={() => setInvPanelOpen(p => !p)}>
              <div className="inv-panel-icon">⚑</div>
              <div className="inv-panel-title">
                {investigatedMembers.length} expert{investigatedMembers.length > 1 ? 's' : ''} under investigation
              </div>
              <div className={`inv-panel-chevron${invPanelOpen ? ' open' : ''}`}>▼</div>
            </div>
            <div style={{ display: invPanelOpen ? 'block' : 'none', padding: '0 16px 14px' }}>
              <div className="inv-panel-grid">
                {investigatedMembers.map(row => (
                  <div
                    key={row.memberName}
                    className="inv-panel-member"
                    onClick={() => scrollToMember(row.memberName)}
                  >
                    <div className="ipm-name">{row.memberName || '—'}</div>
                    <div className="ipm-email">{row.micro1Email || row.personalEmail || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Offboarding panel */}
        {!loading && offboardingMembers.length > 0 && (
          <div id="offb-panel">
            <div className="offb-panel-header" onClick={() => setOffbPanelOpen(p => !p)}>
              <div className="offb-panel-icon">↗</div>
              <div className="offb-panel-title">
                {offboardingMembers.length} expert{offboardingMembers.length > 1 ? 's' : ''} pending offboarding
              </div>
              <div className={`offb-panel-chevron${offbPanelOpen ? ' open' : ''}`}>▼</div>
            </div>
            <div style={{ display: offbPanelOpen ? 'block' : 'none', padding: '0 16px 14px' }}>
              <div className="offb-panel-grid">
                {offboardingMembers.map(row => (
                  <div
                    key={row.memberName}
                    className="offb-panel-member"
                    onClick={() => scrollToMember(row.memberName)}
                  >
                    <div className="opm-name">{row.memberName || '—'}</div>
                    <div className="opm-email">{row.micro1Email || row.personalEmail || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Multi-app panel */}
        {!loading && multiAppMembers.length > 0 && (
          <div id="multiapp-panel">
            <div className="multiapp-header" onClick={() => setMultiAppPanelOpen(p => !p)}>
              <div className="multiapp-icon">⬡</div>
              <div className="multiapp-title">
                {multiAppMembers.length} expert{multiAppMembers.length > 1 ? 's' : ''} using multiple apps
              </div>
              <div className={`multiapp-chevron${multiAppPanelOpen ? ' open' : ''}`}>▼</div>
            </div>
            <div style={{ display: multiAppPanelOpen ? 'block' : 'none', padding: '0 16px 14px' }}>
              <div className="multiapp-grid">
                {multiAppMembers.map(({ row, apps }) => (
                  <div key={row.memberName} className="multiapp-member" onClick={() => scrollToMember(row.memberName)}>
                    <div className="mam-name">{row.memberName || '—'}</div>
                    <div className="mam-apps">{apps.join(' · ')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && hasMoreCols && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Showing last 7 days ·{' '}
            </span>
            <Link
              href={timeTracksHref}
              style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', marginLeft: 4 }}
            >
              View all {visDateCols.length} days →
            </Link>
          </div>
        )}
        <div className="table-wrap" ref={tableWrapRef}>
          <table>
            <thead ref={tableHeadRef}>
              <tr>
                <th className="col-name th-sortable" onClick={() => handleSort('name')}>
                  Expert
                  <span className={`sort-icon${sortCol === 'name' ? ' active' : ''}`}>{sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
                <th className="col-pemail">Personal Email</th>
                <th className="col-memail">Micro1 Email</th>
                <th className="col-hdm">HDM</th>
                <th className="col-tasks th-sortable" onClick={() => handleSort('tasks')}>
                  Tasks
                  <span className={`sort-icon${sortCol === 'tasks' ? ' active' : ''}`}>{sortCol === 'tasks' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
                <th className="col-activity th-sortable" onClick={() => handleSort('activity')}>
                  Activity
                  <span className={`sort-icon${sortCol === 'activity' ? ' active' : ''}`}>{sortCol === 'activity' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
                <th className={`col-total th-total th-sortable${rangeActive ? ' filtered' : ''}`} onClick={() => handleSort('total')}>
                  {rangeActive ? 'Range Total' : 'Total'}
                  <span className={`sort-icon${sortCol === 'total' ? ' active' : ''}`}>{sortCol === 'total' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
                <th className="col-actions"></th>
                {[...displayedDateCols].reverse().map(d => {
                  const dt = new Date(d + 'T00:00:00');
                  return (
                    <th key={d} className="date-th" title={d}>
                      <span className="dow">{DOW[dt.getDay()]}</span>
                      <span className="dom">{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </th>
                  );
                })}
                {hasMoreCols && (
                  <th key="__more" className="date-th">
                    <Link
                      href={timeTracksHref}
                      style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                    >
                      +{moreCount} more →
                    </Link>
                  </th>
                )}
              </tr>
            </thead>
            <tbody ref={tableBodyRef}>
              {loading ? (
                <tr className="state-row">
                  <td colSpan={8 + displayedDateCols.length + (hasMoreCols ? 1 : 0)}>
                    <span className="spinner" />Loading…
                  </td>
                </tr>
              ) : loadError ? (
                <tr className="state-row">
                  <td colSpan={8 + displayedDateCols.length + (hasMoreCols ? 1 : 0)} style={{ color: '#f87171' }}>
                    Error: {loadError}
                  </td>
                </tr>
              ) : allRows.length === 0 ? (
                <tr className="state-row">
                  <td colSpan={8 + displayedDateCols.length + (hasMoreCols ? 1 : 0)}>No records found</td>
                </tr>
              ) : (
                sortedRows.map(row => {
                  const tot = computeTotal(row, visDateCols);
                  const pct = row.activity || '';
                  const isUnderInvestigation = investigatedNames.has(row.memberName);
                  const offbStatus = offboardingStatusMap.get(row.memberName);
                  const isOffboarding = offbStatus === 'pending';
                  const isOffboarded = offbStatus === 'resolved';
                  const rowClass = isOffboarded ? 'row-offboarded' : isOffboarding ? 'row-offboarding' : isUnderInvestigation ? 'row-investigating' : undefined;
                  return (
                    <tr key={row.memberName} {...{ 'data-member': row.memberName || '' }} className={rowClass}>
                      <td className="col-name">{row.memberName || '—'}</td>
                      <td className="col-pemail dim">{row.personalEmail || '—'}</td>
                      <td className="col-memail dim">{row.micro1Email || '—'}</td>
                      <td className="col-hdm dim">{row.hdm || '—'}</td>
                      <td className="col-tasks">
                        {(() => {
                          const from = dateFrom || allDateCols[0] || '';
                          const to   = dateTo   || allDateCols[allDateCols.length - 1] || '';
                          const n = tasksInRange(row, from, to);
                          return n > 0 ? <span style={{ fontWeight: 600 }}>{n}</span> : <span className="dim">—</span>;
                        })()}
                      </td>
                      <td className="col-activity">
                        {pct ? (
                          <span className={`pill ${pillClass(pct)}`}>{pct}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td
                        className={`col-total time-cell${rangeActive ? ' filtered' : ''}`}
                        style={tot === '0:00:00' ? { opacity: 0.35 } : undefined}
                      >
                        {tot}
                      </td>
                      <td className="col-actions">
                        <button
                          className={`investigate-btn${isUnderInvestigation ? ' investigating' : ''}`}
                          disabled={isUnderInvestigation || isOffboarding || isOffboarded}
                          onClick={() => setInvestigateModal({ open: true, row, notes: '', saving: false, error: '' })}
                        >
                          {isUnderInvestigation ? 'Investigating' : 'Investigate'}
                        </button>
                        <button
                          className={`offboard-btn${isOffboarding ? ' offboarding' : isOffboarded ? ' offboarded' : ''}`}
                          disabled={isOffboarding || isOffboarded}
                          onClick={() => setOffboardConfirmRow(row)}
                        >
                          {isOffboarding ? 'Offboarding' : isOffboarded ? 'Offboarded' : 'Offboard'}
                        </button>
                      </td>
                      {[...displayedDateCols].reverse().map(d => {
                        const val = row.dates?.[d] || '0:00:00';
                        return (
                          <td key={d} className={val === '0:00:00' ? 'time-cell zero-time' : 'time-cell'}>
                            {val}
                          </td>
                        );
                      })}
                      {hasMoreCols && (
                        <td key="__more" className="time-cell" style={{ textAlign: 'center', opacity: 0.4 }}>—</td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Fetch Modal */}
      {modalOpen && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="modal">
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/icons8-hubstaff-240.png" width="22" height="22" alt="" style={{ borderRadius: 4 }} />
              Fetch Data from Hubstaff
            </div>

            {!fetchLoading && (
              <>
                <div className="modal-row" style={{ marginBottom: 20 }}>
                  <div className="modal-field">
                    <label>From date</label>
                    <input type="date" value={fetchDateFrom} max={YESTERDAY} onChange={e => setFetchDateFrom(e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>To date</label>
                    <input type="date" value={fetchDateTo} max={YESTERDAY} onChange={e => setFetchDateTo(e.target.value)} />
                  </div>
                </div>
                {fetchError && <div className="modal-error show">{fetchError}</div>}
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                  <button id="modal-fetch-btn" onClick={handleFetch}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Fetch
                  </button>
                </div>
              </>
            )}

            {fetchLoading && (
              <div className="modal-loading show">
                <div className="big-spinner" />
                <p>
                  Fetching data from Hubstaff
                  {fetchDateFrom ? ` (${fetchDateFrom} → ${fetchDateTo || '…'})` : ''}…
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Investigate Modal */}
      {investigateModal.open && investigateModal.row && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget) setInvestigateModal(p => ({ ...p, open: false })); }}
        >
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title-row">
              <span className="modal-title">Investigate Expert</span>
              <button className="modal-x-btn" onClick={() => setInvestigateModal(p => ({ ...p, open: false }))}>✕</button>
            </div>

            <div className="inv-member-info">
              <div className="inv-info-row">
                <span className="inv-info-label">Name</span>
                <span className="inv-info-value">{investigateModal.row.memberName || '—'}</span>
              </div>
              <div className="inv-info-row">
                <span className="inv-info-label">Personal Email</span>
                <span className="inv-info-value dim">{investigateModal.row.personalEmail || '—'}</span>
              </div>
              <div className="inv-info-row">
                <span className="inv-info-label">Micro1 Email</span>
                <span className="inv-info-value dim">{investigateModal.row.micro1Email || '—'}</span>
              </div>
            </div>

            <div className="modal-field">
              <label>Notes / Reason</label>
              <textarea
                className="inv-notes-textarea"
                placeholder="Describe the reason for investigation…"
                value={investigateModal.notes}
                onChange={e => setInvestigateModal(p => ({ ...p, notes: e.target.value }))}
                rows={5}
                autoFocus
              />
            </div>

            {investigateModal.error && (
              <div className="modal-error show">{investigateModal.error}</div>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setInvestigateModal(p => ({ ...p, open: false }))}>
                Cancel
              </button>
              <button
                className="investigate-submit-btn"
                onClick={handleInvestigate}
                disabled={investigateModal.saving || !investigateModal.notes.trim()}
              >
                {investigateModal.saving ? 'Saving…' : 'Save Investigation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offboard Confirm Modal */}
      {offboardConfirmRow && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget) setOffboardConfirmRow(null); }}
        >
          <div className="modal" style={{ width: 400 }}>
            <div className="modal-title-row">
              <span className="modal-title">Confirm Offboarding</span>
              <button className="modal-x-btn" onClick={() => setOffboardConfirmRow(null)}>✕</button>
            </div>
            <p style={{ margin: '16px 0 24px', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              Are you sure you want to offboard <strong style={{ color: 'var(--text)' }}>{offboardConfirmRow.memberName}</strong>?
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setOffboardConfirmRow(null)}>Cancel</button>
              <button
                className="offboard-btn"
                onClick={() => { handleOffboard(offboardConfirmRow); setOffboardConfirmRow(null); }}
              >
                Offboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Modal */}
      {snapshotModalOpen && dailyReport && (() => {
        const activeMembers = Object.entries(dailyReport.member_data ?? {})
          .filter(([, d]) => toSecs(d.total_hours) > 0)
          .sort(([, a], [, b]) => toSecs(b.total_hours) - toSecs(a.total_hours));

        const summaryText =
          `Date: ${formatSnapshotDate(selectedDate)}\n` +
          `Total Active Experts: ${activeMembers.length}\n` +
          `Total Time Tracked: ${dailyReport.total_time}\n` +
          `Average per Expert: ${dailyReport.average_hours_per_member}\n` +
          `Average Activity Level: ${dailyReport.average_activity}`;

        const handleCopy = () => {
          navigator.clipboard.writeText(summaryText).then(() => {
            setCopiedSnapshot(true);
            setTimeout(() => setCopiedSnapshot(false), 2000);
          });
        };

        return (
          <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setSnapshotModalOpen(false); }}>
            <div className="modal modal-snapshot">
              <div className="modal-title-row">
                <span className="modal-title">Daily Snapshot — {formatSnapshotDate(selectedDate)}</span>
                <button className="modal-x-btn" onClick={() => setSnapshotModalOpen(false)}>✕</button>
              </div>

              <div className="snapshot-summary-block">
                <pre className="snapshot-summary-text">{summaryText}</pre>
                <button className="snapshot-copy-btn" onClick={handleCopy} title="Copy to clipboard">
                  {copiedSnapshot
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                </button>
              </div>

              <div className="snapshot-modal-table-wrap">
                <table className="snapshot-modal-table">
                  <thead>
                    <tr>
                      <th>Expert</th>
                      <th>Time</th>
                      <th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMembers.map(([name, data]) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td className="time-cell">{data.total_hours}</td>
                        <td>
                          <span className={`pill ${pillClass(data.activity)}`}>{data.activity}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ textAlign: 'right' }}>
                <button className="btn-secondary" onClick={() => setSnapshotModalOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
