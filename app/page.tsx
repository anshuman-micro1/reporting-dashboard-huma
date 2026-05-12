'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ReportRow {
  memberName: string;
  personalEmail: string | null;
  micro1Email: string | null;
  organization: string;
  timezone: string;
  activity: string;
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

function defaultDateRange(): { from: string; to: string } {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(yesterday);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(weekAgo), to: fmt(yesterday) };
}

const TODAY = new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const [allRows, setAllRows] = useState<ReportRow[]>([]);
  const [allDateCols, setAllDateCols] = useState<string[]>([]);
  const [visDateCols, setVisDateCols] = useState<string[]>([]);
  const [rangeActive, setRangeActive] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [zeroDatesFrom, setZeroDatesFrom] = useState('');
  const [zeroDatesTo, setZeroDatesTo] = useState('');
  const [overHours, setOverHours] = useState(8);
  const [zeroPanelOpen, setZeroPanelOpen] = useState(true);
  const [overPanelOpen, setOverPanelOpen] = useState(true);
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
  const [dailyReport, setDailyReport] = useState<{ total_time: string; average_activity: string; average_hours_per_member: string } | null>(null);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
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
  useEffect(() => {
    const visCols = allDateCols.filter(d => {
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
    setVisDateCols(visCols);
    setRangeActive(!!(dateFrom || dateTo));
  }, [dateFrom, dateTo, allDateCols]);

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
      setAllDateCols(cols);

      if (cols.length > 0) {
        const def = defaultDateRange();
        setZeroDatesFrom(prev => prev || def.from);
        setZeroDatesTo(prev => prev || def.to);
      }

      setZeroPanelOpen(true);
      setOverPanelOpen(true);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh('');
  }, [refresh]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => refresh(value), 280);
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

  // Derived: zero-activity members
  const zeroMembers = (() => {
    const rangeCols = allDateCols.filter(d => (!zeroDatesFrom || d >= zeroDatesFrom) && (!zeroDatesTo || d <= zeroDatesTo));
    if (!rangeCols.length || !allRows.length) return [];
    return allRows.filter(row => rangeCols.every(d => toSecs(row.dates?.[d] ?? '') === 0));
  })();

  // Derived: over-threshold members
  const overMembers = (() => {
    const rangeCols = allDateCols.filter(d => (!zeroDatesFrom || d >= zeroDatesFrom) && (!zeroDatesTo || d <= zeroDatesTo));
    const threshSecs = overHours * 3600;
    if (!rangeCols.length || !allRows.length || threshSecs <= 0) return [];
    return allRows
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

  const rangeTagText = rangeActive
    ? `${dateFrom || allDateCols[0] || '…'} → ${dateTo || allDateCols[allDateCols.length - 1] || '…'}`
    : '';

  const statRange = visDateCols.length ? `${visDateCols[0]} → ${visDateCols[visDateCols.length - 1]}` : '—';
  const statOrg = allRows[0]?.organization || '—';


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
          <button id="fetch-btn" onClick={() => { setFetchError(''); setModalOpen(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Fetch Data
          </button>
        </div>
      </header>

      <main>
        <div className="stats">
          <div className="stat-card">
            <div className="label">Members</div>
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
              <input type="date" value={selectedDate} max={TODAY} onChange={e => setSelectedDate(e.target.value)} className="snapshot-date" />
            </div>
            <div className="snapshot-stats">
              <div className="snapshot-stat">
                <span className="ds-label">Total</span>
                <span className="ds-value">{dailyReportLoading ? '…' : (dailyReport?.total_time ?? '—')}</span>
              </div>
              <div className="snapshot-stat">
                <span className="ds-label">Avg / Member</span>
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
              placeholder="Search name, personal email, micro1 email…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>

          <div className="date-range">
            <label>From</label>
            <input type="date" value={dateFrom} max={TODAY} onChange={e => setDateFrom(e.target.value)} />
            <span className="sep">→</span>
            <label>To</label>
            <input type="date" value={dateTo} max={TODAY} onChange={e => setDateTo(e.target.value)} />
          </div>

          <div className={`range-tag${rangeActive ? ' show' : ''}`}>
            <span>{rangeTagText}</span>
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} title="Clear date filter">✕</button>
          </div>

          <div className="toolbar-spacer" />
          <span className="result-count">
            {!loading && `${allRows.length} member${allRows.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Zero-activity panel */}
        {!loading && zeroMembers.length > 0 && (
          <div id="zero-panel">
            <div className="zero-header" onClick={() => setZeroPanelOpen(p => !p)}>
              <div className="zero-icon">⚠</div>
              <div className="zero-title">
                {zeroMembers.length} member{zeroMembers.length > 1 ? 's' : ''} with no activity
              </div>
              <div className="zero-date-filter" id="zero-date-filter" onClick={e => e.stopPropagation()}>
                <label>From</label>
                <input type="date" value={zeroDatesFrom} max={TODAY} onChange={e => setZeroDatesFrom(e.target.value)} />
                <span className="sep">→</span>
                <label>To</label>
                <input type="date" value={zeroDatesTo} max={TODAY} onChange={e => setZeroDatesTo(e.target.value)} />
              </div>
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
                {overMembers.length} member{overMembers.length > 1 ? 's' : ''} over {overHours}h on a single day
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

        {/* Table */}
        <div className="table-wrap" ref={tableWrapRef}>
          <table>
            <thead ref={tableHeadRef}>
              <tr>
                <th className="col-name">Member</th>
                <th className="col-pemail">Personal Email</th>
                <th className="col-memail">Micro1 Email</th>
                <th className={`col-total th-total${rangeActive ? ' filtered' : ''}`}>
                  {rangeActive ? 'Range Total' : 'Total'}
                </th>
                <th>Activity</th>
                <th>Timezone</th>
                {visDateCols.map(d => {
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
            <tbody ref={tableBodyRef}>
              {loading ? (
                <tr className="state-row">
                  <td colSpan={6 + visDateCols.length}>
                    <span className="spinner" />Loading…
                  </td>
                </tr>
              ) : loadError ? (
                <tr className="state-row">
                  <td colSpan={6 + visDateCols.length} style={{ color: '#f87171' }}>
                    Error: {loadError}
                  </td>
                </tr>
              ) : allRows.length === 0 ? (
                <tr className="state-row">
                  <td colSpan={6 + visDateCols.length}>No records found</td>
                </tr>
              ) : (
                allRows.map(row => {
                  const tot = computeTotal(row, visDateCols);
                  const pct = row.activity || '';
                  return (
                    <tr key={row.memberName} {...{ 'data-member': row.memberName || '' }}>
                      <td className="col-name">{row.memberName || '—'}</td>
                      <td className="col-pemail dim">{row.personalEmail || '—'}</td>
                      <td className="col-memail dim">{row.micro1Email || '—'}</td>
                      <td
                        className={`col-total time-cell${rangeActive ? ' filtered' : ''}`}
                        style={tot === '0:00:00' ? { opacity: 0.35 } : undefined}
                      >
                        {tot}
                      </td>
                      <td>
                        {pct ? (
                          <span className={`pill ${pillClass(pct)}`}>{pct}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td className="dim">{row.timezone || '—'}</td>
                      {visDateCols.map(d => {
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

      {/* Fetch Modal */}
      {modalOpen && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="modal">
            <div className="modal-title">Fetch Data from Hubstaff</div>

            {!fetchLoading && (
              <>
                <div className="modal-row" style={{ marginBottom: 20 }}>
                  <div className="modal-field">
                    <label>From date</label>
                    <input type="date" value={fetchDateFrom} max={TODAY} onChange={e => setFetchDateFrom(e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>To date</label>
                    <input type="date" value={fetchDateTo} max={TODAY} onChange={e => setFetchDateTo(e.target.value)} />
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
    </>
  );
}
