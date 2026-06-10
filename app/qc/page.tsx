"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

const HDM_COLORS = ['#5b73f5', '#f472b6', '#34d399', '#fb923c', '#a78bfa', '#38bdf8', '#fbbf24', '#f87171', '#6ee7b7', '#c084fc'];

// ── types ────────────────────────────────────────────────────────────────────

interface ExpertSummary {
  _id: string;
  expertName?: string;
  expertEmail?: string;
  personalEmail?: string;
  assignedHDM?: string;
  taskCount: number;
  reviewedCount: number;
  pendingCount: number;
  passRate: number | null;
  apps: string[];
  latestDate?: string;
  earliestDate?: string;
  tagStatusBreakdown: Record<string, number>;
  appBreakdown: Record<string, number>;
  reviewerBreakdown: Record<string, number>;
}

interface InactiveExpert {
  name: string;
  personalEmail: string | null;
  expertEmail: string | null;
  app: string | null;
  status: string | null;
  pod: string | null;
  hdm: string | null;
  lastQC: string | null;
  daysSinceQC: number | null;
  reason: string;
}

interface HDMInactiveGroup {
  hdm: string;
  experts: InactiveExpert[];
}

interface QCSub {
  _id?: string;
  date: string;
  expertName?: string;
  expertEmail?: string;
  personalEmail?: string;
  assignedHDM?: string;
  featherLink?: string;
  recordingLength?: string;
  app?: string;
  reviewerName?: string;
  tagStatus?: string;
  notes?: string;
}

interface QCTask { link: string; recordingLength: string; app: string }
interface Report {
  memberName: string;
  personalEmail?: string | null;
  micro1Email?: string | null;
  hdm?: string | null;
  team?: string | null;
  totalWorked?: string;
  activity?: string;
  spentTotal?: string;
  currency?: string;
  dates?: Record<string, string>;
  allTasks?: Array<{ date: string; tasks: QCTask[] }>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function tagColor(status: string | undefined): string {
  if (!status) return 'var(--text-dim)';
  const s = status.toLowerCase();
  if (s.includes('pass') || s.includes('ok') || s.includes('approved')) return '#4ade80';
  if (s.includes('fail') || s.includes('reject') || s.includes('error')) return '#f87171';
  if (s.includes('pend') || s.includes('review')) return '#fbbf24';
  return 'var(--text)';
}

function shortDate(d: string) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

// ── main component ────────────────────────────────────────────────────────────

export default function QCDashboard() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  // list state
  const [experts, setExperts] = useState<ExpertSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [hdmFilter, setHdmFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'expertName' | 'taskCount' | 'reviewedCount' | 'pendingCount' | 'latestDate'>('taskCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // tab
  const [tab, setTab] = useState<'overview' | 'inactive'>('overview');

  // detail state
  const [selected, setSelected] = useState<ExpertSummary | null>(null);
  const [submissions, setSubmissions] = useState<QCSub[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // inactive state
  const [inactiveGroups, setInactiveGroups] = useState<HDMInactiveGroup[]>([]);
  const [inactiveTotalCount, setInactiveTotalCount] = useState(0);
  const [loadingInactive, setLoadingInactive] = useState(false);
  const [inactiveError, setInactiveError] = useState('');
  const [thresholdDays, setThresholdDays] = useState(30);
  const [expandedHDM, setExpandedHDM] = useState<string | null>(null);

  useEffect(() => { fetchExperts(); }, []);

  async function fetchExperts() {
    setLoadingList(true); setError('');
    try {
      const res = await fetch('/api/qc/experts');
      if (!res.ok) throw new Error(await res.text());
      setExperts(await res.json());
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unknown'); }
    finally { setLoadingList(false); }
  }

  async function openDetail(exp: ExpertSummary) {
    setSelected(exp);
    setSubmissions([]); setReport(null);
    setLoadingDetail(true);
    try {
      const email = exp.expertEmail || exp._id;
      const res = await fetch(`/api/qc/expert?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSubmissions(data.submissions ?? []);
      setReport(data.report ?? null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unknown'); }
    finally { setLoadingDetail(false); }
  }

  async function handleSync() {
    setSyncing(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/qc', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setMessage('Sheet sync completed.');
      await fetchExperts();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unknown'); }
    finally { setSyncing(false); }
  }

  async function handleUpload() {
    if (!selectedFile) { setError('Choose a file first.'); return; }
    setUploading(true); setError(''); setMessage('');
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const res = await fetch('/api/qc/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMessage(`Upload done — upserted: ${data.result?.upserted ?? 0}, modified: ${data.result?.modified ?? 0}, rejected: ${data.rejected ?? 0}`);
      setSelectedFile(null);
      await fetchExperts();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unknown'); }
    finally { setUploading(false); }
  }

  async function fetchInactive(days = thresholdDays) {
    setLoadingInactive(true); setInactiveError('');
    try {
      const res = await fetch(`/api/expert-profiles/inactive?days=${days}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInactiveGroups(data.groups ?? []);
      setInactiveTotalCount(data.totalInactive ?? 0);
    } catch (e: unknown) { setInactiveError(e instanceof Error ? e.message : 'Unknown'); }
    finally { setLoadingInactive(false); }
  }


  const totalTasks    = experts.reduce((s, e) => s + e.taskCount, 0);
  const totalReviewed = experts.reduce((s, e) => s + e.reviewedCount, 0);
  const totalPending  = experts.reduce((s, e) => s + e.pendingCount, 0);

  // HDM aggregate cards
  const hdmMap: Record<string, { taskCount: number; reviewedCount: number; pendingCount: number; expertCount: number }> = {};
  for (const e of experts) {
    const key = e.assignedHDM || 'Unassigned';
    if (!hdmMap[key]) hdmMap[key] = { taskCount: 0, reviewedCount: 0, pendingCount: 0, expertCount: 0 };
    hdmMap[key].taskCount     += e.taskCount;
    hdmMap[key].reviewedCount += e.reviewedCount;
    hdmMap[key].pendingCount  += e.pendingCount;
    hdmMap[key].expertCount   += 1;
  }
  const hdmList = Object.entries(hdmMap).sort(([, a], [, b]) => b.taskCount - a.taskCount);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const filtered = experts
    .filter(e => {
      if (hdmFilter && (e.assignedHDM || 'Unassigned') !== hdmFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (e.expertName || '').toLowerCase().includes(q) ||
        (e.expertEmail || '').toLowerCase().includes(q) ||
        (e.assignedHDM || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (sortField === 'expertName')    { av = a.expertName || ''; bv = b.expertName || ''; }
      else if (sortField === 'latestDate') { av = a.latestDate || ''; bv = b.latestDate || ''; }
      else { av = a[sortField]; bv = b[sortField]; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  // ── INACTIVE VIEW ────────────────────────────────────────────────────────────
  if (!selected && tab === 'inactive') {
    return (
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>QC Dashboard</h1>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost">← Hubstaff</Button>
          </Link>
        </div>
        {/* tab bar */}
        <TabBar tab={tab} setTab={t => { setTab(t); if (t === 'inactive' && !inactiveGroups.length) fetchInactive(); }} />

        {/* threshold control */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 13 }}>No QC in</span>
          <input
            type="number" min={1} max={365} value={thresholdDays}
            onChange={e => setThresholdDays(Number(e.target.value))}
            style={{ width: 64, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 13, color: 'var(--text)', textAlign: 'center', outline: 'none' }}
          />
          <span style={{ fontSize: 13 }}>days</span>
          <Button variant="secondary" onClick={() => fetchInactive(thresholdDays)}>Apply</Button>
        </div>

        {inactiveError && <div style={{ color: '#f87171', marginBottom: 12 }}>{inactiveError}</div>}
        {message && <div style={{ color: '#4ade80', marginBottom: 12, fontSize: 13 }}>{message}</div>}

        {loadingInactive ? (
          <div style={{ color: 'var(--text)', padding: 24 }}>Loading inactive experts…</div>
        ) : inactiveGroups.length === 0 ? (
          <div style={{ color: 'var(--text)', padding: 24, textAlign: 'center' }}>
            No inactive experts found.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: '#f87171', fontSize: 18 }}>{inactiveTotalCount}</span>
              <span style={{ marginLeft: 6 }}>inactive experts across {inactiveGroups.length} HDM{inactiveGroups.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {inactiveGroups.map((group, gi) => {
                const color = HDM_COLORS[gi % HDM_COLORS.length];
                const open = expandedHDM === group.hdm;
                return (
                  <div key={group.hdm} style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderLeft: `4px solid ${color}`, borderRadius: 12, overflow: 'hidden' }}>
                    {/* HDM header */}
                    <div
                      onClick={() => setExpandedHDM(open ? null : group.hdm)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color }}>{group.hdm}</span>
                        <span style={{ background: '#f8717122', color: '#f87171', fontWeight: 700, fontSize: 12, borderRadius: 6, padding: '2px 8px' }}>
                          {group.experts.length} inactive
                        </span>
                      </div>
                      <span style={{ color, fontSize: 16 }}>{open ? '▲' : '▼'}</span>
                    </div>

                    {open && (
                      <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-2)' }}>
                              {['Name', 'Personal Email', 'Expert Email', 'App', 'Status', 'Pod', 'Last QC', 'Days Inactive', 'Reason'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.experts.map((ex, i) => (
                              <tr key={ex.expertEmail ?? ex.name} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)' }}>
                                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{ex.name}</td>
                                <td style={{ padding: '10px 16px', fontSize: 12 }}>{ex.personalEmail || '—'}</td>
                                <td style={{ padding: '10px 16px', fontSize: 12 }}>{ex.expertEmail || '—'}</td>
                                <td style={{ padding: '10px 16px' }}>{ex.app || '—'}</td>
                                <td style={{ padding: '10px 16px' }}>
                                  {ex.status
                                    ? <span style={{ color: ex.status.toLowerCase() === 'active' ? '#4ade80' : '#f87171', fontWeight: 600 }}>{ex.status}</span>
                                    : '—'}
                                </td>
                                <td style={{ padding: '10px 16px' }}>{ex.pod || '—'}</td>
                                <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{ex.lastQC ? shortDate(ex.lastQC) : <span style={{ color: '#f87171' }}>Never</span>}</td>
                                <td style={{ padding: '10px 16px', fontWeight: 700, color: (ex.daysSinceQC ?? 999) > 60 ? '#f87171' : '#fbbf24' }}>
                                  {ex.daysSinceQC != null ? `${ex.daysSinceQC}d` : <span style={{ color: '#f87171' }}>—</span>}
                                </td>
                                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text)' }}>{ex.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────────
  if (selected) {
    const allDates = report?.dates ? Object.entries(report.dates).sort(([a], [b]) => a.localeCompare(b)) : [];
    const totalQCTasks = report?.allTasks?.reduce((s, e) => s + (e.tasks?.length ?? 0), 0) ?? 0;

    function toSecs(h: string) {
      if (!h || h === '0:00:00') return 0;
      const p = h.split(':').map(Number);
      return p[0] * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }
    function fromSecs(s: number) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sc = s % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
    }
    const totalWorked = allDates.length > 0
      ? fromSecs(allDates.reduce((sum, [, h]) => sum + toSecs(h), 0))
      : (report?.totalWorked || '—');

    // merge Hubstaff dates + QC submission dates into one sorted list
    const submissionsByDate = submissions.reduce<Record<string, number>>((acc, s) => {
      if (s.date) acc[s.date] = (acc[s.date] || 0) + 1;
      return acc;
    }, {});
    const allDayKeys = Array.from(new Set([
      ...allDates.map(([d]) => d),
      ...Object.keys(submissionsByDate),
    ])).sort().reverse();
    const dailyRows = allDayKeys.map(date => ({
      date,
      hoursWorked: report?.dates?.[date] || null,
      taskCount: submissionsByDate[date] || 0,
    }));

    return (
      <div style={{ padding: '20px 24px' }}>
        {/* back + header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button variant="secondary" onClick={() => { setSelected(null); setError(''); }}>← Back</Button>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{selected.expertName || selected._id}</h1>
            {selected.assignedHDM && <span style={{ fontSize: 13, color: 'var(--text-dim)', marginLeft: 4 }}>HDM: {selected.assignedHDM}</span>}
          </div>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost">← Hubstaff</Button>
          </Link>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}
        {loadingDetail && <div style={{ color: 'var(--text)' }}>Loading…</div>}

        {!loadingDetail && (
          <>
            {/* ── row 1: top stat cards ── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <BigStatCard label="QC Tasks"     value={selected.taskCount} />
              <BigStatCard label="Reviewed"     value={selected.reviewedCount} color="#4ade80" />
              <BigStatCard label="Pending"      value={selected.pendingCount}  color={selected.pendingCount > 0 ? '#fbbf24' : undefined} />
              <BigStatCard label="Total Worked" value={totalWorked} />
              <BigStatCard label="Activity"     value={report?.activity    || '—'} />
              {report?.spentTotal && (
                <BigStatCard label="Spent" value={`${report.spentTotal} ${report.currency || ''}`.trim()} />
              )}
              {totalQCTasks > 0 && (
                <BigStatCard label="Hubstaff Tasks" value={totalQCTasks} />
              )}
            </div>

            {/* ── row 2: metrics cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
              <MetricsCard title="Tag Status">
                {Object.entries(selected.tagStatusBreakdown).length === 0
                  ? <EmptyMetric />
                  : Object.entries(selected.tagStatusBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([status, count]) => (
                        <MetricRow key={status} label={status} value={count} color={tagColor(status)} total={selected.reviewedCount} />
                      ))}
              </MetricsCard>

              <MetricsCard title="By App">
                {Object.entries(selected.appBreakdown).length === 0
                  ? <EmptyMetric />
                  : Object.entries(selected.appBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([app, count]) => (
                        <MetricRow key={app} label={app} value={count} total={selected.taskCount} />
                      ))}
              </MetricsCard>

              <MetricsCard title="Reviewers">
                {Object.entries(selected.reviewerBreakdown).length === 0
                  ? <EmptyMetric />
                  : Object.entries(selected.reviewerBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, count]) => (
                        <MetricRow key={name} label={name} value={count} total={selected.reviewedCount} />
                      ))}
              </MetricsCard>
            </div>

            {/* ── row 3: profile info + hours by date ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16, marginBottom: 20 }}>
              {/* compact profile */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text-dim)', marginBottom: 14 }}>Profile</div>
                <ProfileRow label="Expert Email"   value={selected.expertEmail} />
                <ProfileRow label="Personal Email" value={selected.personalEmail} />
                <ProfileRow label="HDM"            value={selected.assignedHDM} />
                {report && (
                  <>
                    <ProfileRow label="Team" value={report.team} />
                    <ProfileRow label="Org"  value={report.memberName !== selected.expertName ? report.memberName : undefined} />
                  </>
                )}
              </div>

              {/* hours by date */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text-dim)', marginBottom: 14 }}>Hours by Date (Hubstaff)</div>
                {allDates.length === 0
                  ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No Hubstaff time data found.</div>
                  : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {allDates.map(([date, hours]) => (
                        <div key={date} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                          <span style={{ color: 'var(--text)' }}>{shortDate(date)}</span>
                          <span style={{ marginLeft: 8, fontWeight: 600 }}>{hours}</span>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>

            {/* ── row 4: daily breakdown ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>Daily Breakdown</span>
                <span style={{ fontSize: 12, color: 'var(--text)' }}>{dailyRows.length} day{dailyRows.length !== 1 ? 's' : ''}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {['Date', 'Time Worked', 'Tasks Submitted'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>No data.</td></tr>
                  ) : dailyRows.map((row, i) => (
                    <tr key={row.date} style={{ borderTop: '1px solid var(--border-soft)', background: i % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)' }}>
                      <td style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>{shortDate(row.date)}</td>
                      <td style={{ padding: '10px 20px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {row.hoursWorked
                          ? <span style={{ fontWeight: 600 }}>{row.hoursWorked}</span>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 20px' }}>
                        {row.taskCount > 0
                          ? <span style={{ fontWeight: 600, color: '#4ade80' }}>{row.taskCount}</span>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── row 5: submissions table ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>QC Submissions</span>
                <span style={{ fontSize: 12, color: 'var(--text)' }}>{submissions.length} record{submissions.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      {['Date', 'App', 'Length', 'Feather Link', 'Reviewer', 'Tag Status', 'Notes'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-dim)' }}>No submissions found.</td></tr>
                    ) : submissions.map((s, i) => (
                      <tr key={s._id ?? i} style={{ borderTop: '1px solid var(--border-soft)', background: i % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)' }}>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{shortDate(s.date)}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.app || '—'}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.recordingLength || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {s.featherLink
                            ? <a href={s.featherLink} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12 }}>↗ Open</a>
                            : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.reviewerName || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          {s.tagStatus
                            ? <span style={{ color: tagColor(s.tagStatus), fontWeight: 600 }}>{s.tagStatus}</span>
                            : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{s.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>QC Dashboard</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost">← Hubstaff</Button>
          </Link>
          <Button variant="secondary" onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Sheet'}</Button>
        </div>
      </div>
      <TabBar tab={tab} setTab={t => { setTab(t); if (t === 'inactive' && !inactiveGroups.length) fetchInactive(); }} />

      {error   && <div style={{ color: '#f87171', marginBottom: 10 }}>{error}</div>}
      {message && <div style={{ color: '#4ade80', marginBottom: 10, fontSize: 13 }}>{message}</div>}

      {/* admin upload */}
      {isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Excel / CSV Upload</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setSelectedFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
            <Button variant="secondary" onClick={handleUpload} disabled={uploading || !selectedFile}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
            {selectedFile && <span style={{ fontSize: 12, color: 'var(--text)' }}>{selectedFile.name}</span>}
          </div>
        </div>
      )}

      {/* global summary stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Experts"     value={experts.length} />
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard label="Reviewed"    value={totalReviewed} sub={totalTasks ? `${Math.round(totalReviewed / totalTasks * 100)}%` : '—'} />
        <StatCard label="Pending"     value={totalPending} />
      </div>

      {/* HDM cards */}
      {!loadingList && hdmList.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text-dim)', marginBottom: 10 }}>By HDM — click to filter</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {hdmList.map(([hdm, stats], idx) => {
              const color = HDM_COLORS[idx % HDM_COLORS.length];
              const active = hdmFilter === hdm;
              const reviewedPct = stats.taskCount > 0 ? Math.round(stats.reviewedCount / stats.taskCount * 100) : 0;
              return (
                <div
                  key={hdm}
                  onClick={() => setHdmFilter(active ? null : hdm)}
                  style={{
                    background: active ? color + '22' : 'var(--surface)',
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 10,
                    padding: '12px 16px',
                    minWidth: 180,
                    cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{hdm}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>{stats.expertCount} expert{stats.expertCount !== 1 ? 's' : ''}</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{stats.taskCount}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>TASKS</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: '#4ade80' }}>{stats.reviewedCount}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>REVIEWED</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: stats.pendingCount > 0 ? '#fbbf24' : 'var(--text-dim)' }}>{stats.pendingCount}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>PENDING</div>
                    </div>
                  </div>
                  {/* mini progress bar */}
                  <div style={{ marginTop: 10, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${reviewedPct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>{reviewedPct}% reviewed</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* search + active filter pill */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search expert, email, or HDM…"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', width: 280, outline: 'none' }}
        />
        {hdmFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px', fontSize: 12 }}>
            <span style={{ color: 'var(--text)' }}>HDM:</span>
            <span style={{ fontWeight: 600 }}>{hdmFilter}</span>
            <button onClick={() => setHdmFilter(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
          </div>
        )}
        {(search || hdmFilter) && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filtered.length} of {experts.length} experts</span>
        )}
      </div>

      {/* experts table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {([
                { label: 'Expert',       field: 'expertName'    as const },
                { label: 'Expert Email', field: null },
                { label: 'HDM',          field: null },
                { label: 'Tasks',        field: 'taskCount'     as const },
                { label: 'Reviewed',     field: 'reviewedCount' as const },
                { label: 'Pending',      field: 'pendingCount'  as const },
                { label: 'Apps',         field: null },
                { label: 'Last QC',      field: 'latestDate'    as const },
              ] as { label: string; field: typeof sortField | null }[]).map(({ label, field }) => (
                <th
                  key={label}
                  onClick={field ? () => toggleSort(field) : undefined}
                  style={{
                    textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap',
                    color: sortField === field ? 'var(--accent)' : 'var(--text)',
                    cursor: field ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  {label}{field && sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : (field ? ' ↕' : '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingList ? (
              <tr><td colSpan={8} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-dim)' }}>No experts found.</td></tr>
            ) : filtered.map((e, i) => {
              const hdmColor = HDM_COLORS[hdmList.findIndex(([h]) => h === (e.assignedHDM || 'Unassigned')) % HDM_COLORS.length];
              return (
                <tr
                  key={e._id}
                  onClick={() => openDetail(e)}
                  style={{ borderTop: '1px solid var(--border-soft)', background: i % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)', cursor: 'pointer' }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--row-hover)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = i % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)')}
                >
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{e.expertName || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text)', fontSize: 12 }}>{e.expertEmail || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {e.assignedHDM
                      ? <span style={{ color: hdmColor, fontWeight: 600, fontSize: 12 }}>{e.assignedHDM}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 800, fontSize: 15 }}>{e.taskCount}</td>
                  <td style={{ padding: '11px 14px', color: '#4ade80', fontWeight: 700 }}>{e.reviewedCount}</td>
                  <td style={{ padding: '11px 14px', fontWeight: e.pendingCount > 0 ? 700 : 400 }}>
                    {e.pendingCount > 0
                      ? <span style={{ background: '#fbbf2422', color: '#fbbf24', borderRadius: 4, padding: '2px 7px', fontSize: 12, fontWeight: 700 }}>{e.pendingCount}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>0</span>}
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--text)', fontSize: 12 }}>{e.apps.filter(Boolean).slice(0, 3).join(', ') || '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text)', whiteSpace: 'nowrap', fontSize: 12 }}>{shortDate(e.latestDate || '')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── small reusable pieces ─────────────────────────────────────────────────────

function BigStatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px', minWidth: 110 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.7px', color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', minWidth: 120 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
      <span style={{ color: 'var(--text-dim)', marginRight: 5 }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || 'var(--text)' }}>{value}</span>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text-dim)', minWidth: 110 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function MetricsCard({ title, passRate, children }: { title: string; passRate?: number | null; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.7px', color: 'var(--text-dim)' }}>{title}</div>
        {passRate != null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: passRate >= 80 ? '#4ade80' : passRate >= 50 ? '#fbbf24' : '#f87171' }}>
            {passRate}% pass
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>{children}</div>
    </div>
  );
}

function MetricRow({ label, value, color, total }: { label: string; value: number; color?: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 13 }}>
        <span style={{ color: color || 'var(--text)', fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--text)', fontSize: 12 }}>{value} <span style={{ color: 'var(--text-dim)' }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color || 'var(--accent)', borderRadius: 2, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function EmptyMetric() {
  return <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No data yet.</div>;
}

function TabBar({ tab, setTab }: { tab: 'overview' | 'inactive'; setTab: (t: 'overview' | 'inactive') => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
      {(['overview', 'inactive'] as const).map(t => (
        <button
          key={t}
          onClick={() => setTab(t)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            color: tab === t ? 'var(--accent)' : 'var(--text)',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'color .15s',
            textTransform: 'capitalize',
          }}
        >
          {t === 'overview' ? 'Overview' : 'Inactive Experts'}
        </button>
      ))}
    </div>
  );
}
