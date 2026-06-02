'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

// ── types ──────────────────────────────────────────────────────────────────

interface Expert {
  id: string;
  name: string;
  personalEmail: string | null;
  micro1Email: string | null;
  hdm: string | null;
  team: string | null;
}

interface EditFields {
  personalEmail: string;
  micro1Email: string;
  hdm: string;
  team: string;
}

interface ParsedRow {
  name: string;
  personalEmail: string;
  expertEmail: string;
  hdm: string;
  team: string;
}

interface UploadResult {
  updated: number;
  notFound: string[];
}

interface QCParsedRow {
  date: string;
  expertEmail: string;
  expertName: string;
  link: string;
  recordingLength: string;
  app: string;
}

interface QCUploadResult {
  updated: number;
  notFound: string[];
}

// ── csv helpers ────────────────────────────────────────────────────────────

function tokeniseRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normaliseHeader(h: string): string {
  return h.replace(/[^\x00-\x7F]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCsv(text: string): { rows: ParsedRow[]; error: string } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'CSV must have a header row and at least one data row.' };

  const headers = tokeniseRow(lines[0]).map(normaliseHeader);

  const idx = {
    name:          headers.findIndex(h => h === 'member name'),
    personalEmail: headers.findIndex(h => h === 'personal email'),
    expertEmail:   headers.findIndex(h => h === 'micro1 email' || h === 'expert email'),
    hdm:           headers.findIndex(h => h === 'hdm' || h.startsWith('hdm')),
    team:          headers.findIndex(h => h === 'team'),
  };

  const requiredIdx = { name: idx.name, personalEmail: idx.personalEmail, expertEmail: idx.expertEmail, hdm: idx.hdm };
  const missing = Object.entries(requiredIdx).filter(([, v]) => v === -1).map(([k]) => k);
  if (missing.length > 0) {
    return { rows: [], error: `Missing columns: ${missing.join(', ')}. Expected: Member Name, Personal Email, Micro1 Email, HDM` };
  }

  const rows: ParsedRow[] = lines.slice(1).map(line => {
    const cols = tokeniseRow(line);
    return {
      name:          cols[idx.name]          ?? '',
      personalEmail: cols[idx.personalEmail] ?? '',
      expertEmail:   cols[idx.expertEmail]   ?? '',
      hdm:           cols[idx.hdm]           ?? '',
      team:          idx.team !== -1 ? (cols[idx.team] ?? '') : '',
    };
  }).filter(r => r.name !== '');

  return { rows, error: '' };
}

function parseQcDate(raw: string): string {
  const clean = raw.trim().split(' ')[0];
  const parts = clean.split('/');
  if (parts.length !== 3) return '';
  let [m, d, y] = parts;
  if (y.length === 2) y = '20' + y;
  if (!/^\d+$/.test(m) || !/^\d+$/.test(d) || !/^\d+$/.test(y)) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseQcCsv(text: string): { rows: QCParsedRow[]; error: string } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'CSV must have a header row and at least one data row.' };

  const headers = tokeniseRow(lines[0]).map(normaliseHeader);

  const idx = {
    date:            headers.findIndex(h => h === 'date'),
    expertName:      headers.findIndex(h => h === 'expert name'),
    expertEmail:     headers.findIndex(h => h === 'expert email'),
    link:            headers.findIndex(h => h === 'feather link'),
    recordingLength: headers.findIndex(h => h === 'recording length'),
    app:             headers.findIndex(h => h === 'app'),
  };

  if (idx.date === -1 || idx.expertEmail === -1 || idx.link === -1) {
    return { rows: [], error: 'Missing required columns: Date, Expert Email, Feather Link' };
  }

  const rows: QCParsedRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = tokeniseRow(line);
    const rawDate        = (cols[idx.date]            ?? '').trim();
    const expertEmail    = (cols[idx.expertEmail]      ?? '').trim().toLowerCase();
    const expertName     = idx.expertName      !== -1 ? (cols[idx.expertName]      ?? '').trim() : '';
    const link           = (cols[idx.link]             ?? '').trim();
    const recordingLength = idx.recordingLength !== -1 ? (cols[idx.recordingLength] ?? '').trim() : '';
    const app            = idx.app             !== -1 ? (cols[idx.app]             ?? '').trim() : '';

    if (!rawDate || !expertEmail || !link) continue;
    if (expertEmail === '#n/a' || expertEmail === 'not found') continue;
    if (!link.startsWith('http')) continue;

    const date = parseQcDate(rawDate);
    if (!date) continue;

    rows.push({ date, expertEmail, expertName, link, recordingLength, app });
  }

  return { rows, error: '' };
}

// ── field meta ─────────────────────────────────────────────────────────────

const EDIT_FIELDS: { key: keyof EditFields; label: string; placeholder: string }[] = [
  { key: 'personalEmail', label: 'Personal Email',  placeholder: 'e.g. john@gmail.com' },
  { key: 'micro1Email',   label: 'Micro1 Email',    placeholder: 'e.g. john@micro1.com' },
  { key: 'hdm',           label: 'HDM',             placeholder: 'e.g. Jane Smith' },
  { key: 'team',          label: 'Team',            placeholder: 'e.g. Engineering' },
];

// ── component ──────────────────────────────────────────────────────────────

export default function MembersUploadPage() {
  // csv upload
  const [rows, setRows]             = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [fileName, setFileName]     = useState('');
  const [uploading, setUploading]   = useState(false);
  const [result, setResult]         = useState<UploadResult | null>(null);
  const [apiError, setApiError]     = useState('');
  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState<{ inserted: number; total: number } | null>(null);
  const [syncError, setSyncError]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // search
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<Expert[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const [hoveredId, setHoveredId]         = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // edit modal
  const [editExpert, setEditExpert]   = useState<Expert | null>(null);
  const [editFields, setEditFields]   = useState<EditFields>({ personalEmail: '', micro1Email: '', hdm: '', team: '' });
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // qc tracking upload
  const [qcRows, setQcRows]           = useState<QCParsedRow[]>([]);
  const [qcFileName, setQcFileName]   = useState('');
  const [qcParseError, setQcParseError] = useState('');
  const [qcUploading, setQcUploading] = useState(false);
  const [qcResult, setQcResult]       = useState<QCUploadResult | null>(null);
  const [qcApiError, setQcApiError]   = useState('');
  const qcFileRef = useRef<HTMLInputElement>(null);

  // search debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setShowDropdown(true);
      try {
        const res = await fetch(`/api/members?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // click outside closes dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openEdit = (expert: Expert) => {
    setEditExpert(expert);
    setEditFields({
      personalEmail: expert.personalEmail ?? '',
      micro1Email:   expert.micro1Email   ?? '',
      hdm:           expert.hdm           ?? '',
      team:          expert.team          ?? '',
    });
    setShowDropdown(false);
    setSearchQuery('');
    setSaveError('');
    setSaveSuccess(false);
    setShowConfirm(false);
  };

  const closeModal = () => {
    if (saving) return;
    setEditExpert(null);
    setShowConfirm(false);
    setSaveError('');
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!editExpert) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:            editExpert.id,
          personalEmail: editFields.personalEmail.trim() || null,
          micro1Email:   editFields.micro1Email.trim()   || null,
          hdm:           editFields.hdm.trim()           || null,
          team:          editFields.team.trim()          || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setSaveSuccess(true);
      setShowConfirm(false);
      setTimeout(() => closeModal(), 1400);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
      setShowConfirm(false);
    } finally {
      setSaving(false);
    }
  };

  // csv upload handlers
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setApiError('');
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const { rows: parsed, error } = parseCsv(text);
      setParseError(error);
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!rows.length) return;
    setUploading(true);
    setApiError('');
    setResult(null);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setRows([]);
    setFileName('');
    setParseError('');
    setResult(null);
    setApiError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    setSyncResult(null);
    try {
      const res = await fetch('/api/members/sync', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setSyncResult({ inserted: data.inserted, total: data.total });
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSyncing(false);
    }
  };

  const handleQcFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQcFileName(file.name);
    setQcResult(null);
    setQcApiError('');
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const { rows: parsed, error } = parseQcCsv(text);
      setQcParseError(error);
      setQcRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleQcUpload = async () => {
    if (!qcRows.length) return;
    setQcUploading(true);
    setQcApiError('');
    setQcResult(null);
    try {
      const res = await fetch('/api/qc-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: qcRows }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setQcResult(data);
      setQcRows([]);
      setQcFileName('');
      if (qcFileRef.current) qcFileRef.current.value = '';
    } catch (err: unknown) {
      setQcApiError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQcUploading(false);
    }
  };

  const dropdownVisible = showDropdown && searchQuery.trim().length >= 2;

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
          Update Experts
        </div>
        <div className="header-right">
          <Link href="/" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            ← Dashboard
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px' }}>

        {/* ── Search Expert ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 18, marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            Search Expert
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
            Find an expert by name, personal email, or micro1 email to view and edit their details.
          </div>

          <div ref={searchRef} style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, personal email or micro1 email…"
              style={{ paddingLeft: 12 }}
            />

            {dropdownVisible && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, zIndex: 200,
                boxShadow: '0 8px 24px rgba(0,0,0,.45)',
                maxHeight: 300, overflowY: 'auto',
              }}>
                {searchLoading && (
                  <div style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="spinner" style={{ width: 13, height: 13, margin: 0 }} />
                    Searching…
                  </div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: 13 }}>
                    No experts found
                  </div>
                )}
                {!searchLoading && searchResults.map(expert => (
                  <div
                    key={expert.id}
                    onMouseEnter={() => setHoveredId(expert.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openEdit(expert)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-soft)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                      background: hoveredId === expert.id ? 'var(--row-hover)' : 'transparent',
                      transition: 'background 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{expert.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[expert.personalEmail, expert.micro1Email].filter(Boolean).join(' · ') || 'No emails set'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>Edit →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── CSV Upload ── */}
        <div className="inv-page-header">
          <h2 className="inv-page-title">Upload Expert CSV</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {rows.length > 0 && !result && (
              <span className="result-count">{rows.length} row{rows.length !== 1 ? 's' : ''} parsed</span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', cursor: syncing ? 'not-allowed' : 'pointer',
                opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing
                ? <><span className="spinner" style={{ width: 11, height: 11 }} />Fetching…</>
                : <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
                    </svg>
                    Fetch Experts from Hubstaff
                  </>
              }
            </button>
          </div>
        </div>

        {syncResult && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            background: '#0d2318', border: '1px solid #166534',
            color: '#4ade80', fontSize: 13, fontWeight: 600,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {syncResult.inserted} new expert{syncResult.inserted !== 1 ? 's' : ''} added to DB
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
              ({syncResult.total} fetched from Hubstaff)
            </span>
            <button className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setSyncResult(null)}>✕</button>
          </div>
        )}
        {syncError && (
          <div className="modal-error show" style={{ marginBottom: 16 }}>{syncError}</div>
        )}

        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
          Upload a CSV with columns: <strong style={{ color: 'var(--text)' }}>Member Name</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>Personal Email</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>Micro1 Email</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>HDM</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>Team</strong> (optional).
          Experts are matched by name (case-insensitive). Unmatched names are listed at the end.
        </p>

        {!result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <label
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontWeight: 600,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Choose CSV
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
            </label>
            {fileName && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{fileName}</span>}
            {rows.length > 0 && (
              <>
                <div style={{ flex: 1 }} />
                <button className="btn-secondary" onClick={handleReset} style={{ fontSize: 13 }}>Clear</button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  {uploading ? 'Updating…' : `Update ${rows.length} expert${rows.length !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        )}

        {parseError && <div className="modal-error show" style={{ marginBottom: 16 }}>{parseError}</div>}
        {apiError   && <div className="modal-error show" style={{ marginBottom: 16 }}>{apiError}</div>}

        {result && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 18px', borderRadius: 10,
              background: '#0d2318', border: '1px solid #166534',
              color: '#4ade80', fontSize: 14, fontWeight: 600, marginBottom: 12,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {result.updated} expert{result.updated !== 1 ? 's' : ''} updated successfully
              <div style={{ flex: 1 }} />
              <button className="btn-secondary" onClick={handleReset} style={{ fontSize: 12 }}>Upload another</button>
            </div>

            {result.notFound.length > 0 && (
              <div style={{
                padding: '14px 18px', borderRadius: 10,
                background: '#1a0f0f', border: '1px solid #7f1d1d',
              }}>
                <div style={{ color: '#f87171', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  {result.notFound.length} name{result.notFound.length !== 1 ? 's' : ''} not found in database
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.notFound.map(name => (
                    <span key={name} style={{
                      padding: '3px 10px', borderRadius: 6,
                      background: '#2d1515', border: '1px solid #7f1d1d',
                      color: '#fca5a5', fontSize: 12,
                    }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && !result && (
          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Member Name</th>
                  <th style={{ minWidth: 210 }}>Personal Email</th>
                  <th style={{ minWidth: 210 }}>Micro1 Email</th>
                  <th style={{ minWidth: 160 }}>HDM</th>
                  <th style={{ minWidth: 120 }}>Team</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.name || '—'}</td>
                    <td className="dim">{row.personalEmail || '—'}</td>
                    <td className="dim">{row.expertEmail || '—'}</td>
                    <td className="dim">{row.hdm || '—'}</td>
                    <td className="dim">{row.team || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* ── QC Tracking Upload ── */}
        <div style={{ marginTop: 40 }}>
          <div className="inv-page-header">
            <h2 className="inv-page-title">Upload QC Tracking CSV</h2>
            {qcRows.length > 0 && !qcResult && (
              <span className="result-count">{qcRows.length} task row{qcRows.length !== 1 ? 's' : ''} parsed</span>
            )}
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Upload the daily QC Tracking sheet to sync task data into expert reports.
            Required columns: <strong style={{ color: 'var(--text)' }}>Date</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>Expert Email</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>Feather Link</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>Recording Length</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>App</strong>.
          </p>

          {!qcResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontWeight: 600,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Choose QC CSV
                <input ref={qcFileRef} type="file" accept=".csv,text/csv" onChange={handleQcFile} style={{ display: 'none' }} />
              </label>
              {qcFileName && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{qcFileName}</span>}
              {qcRows.length > 0 && (
                <>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={handleQcUpload}
                    disabled={qcUploading}
                    style={{
                      padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: 'var(--accent)', color: '#fff', border: 'none',
                      cursor: qcUploading ? 'not-allowed' : 'pointer', opacity: qcUploading ? 0.6 : 1,
                    }}
                  >
                    {qcUploading
                      ? <><span className="spinner" style={{ width: 13, height: 13 }} />Updating…</>
                      : `Update ${qcRows.length} task row${qcRows.length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          )}

          {qcParseError && <div className="modal-error show" style={{ marginBottom: 16 }}>{qcParseError}</div>}
          {qcApiError   && <div className="modal-error show" style={{ marginBottom: 16 }}>{qcApiError}</div>}

          {qcResult && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 18px', borderRadius: 10,
                background: '#0d2318', border: '1px solid #166534',
                color: '#4ade80', fontSize: 14, fontWeight: 600, marginBottom: 12,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {qcResult.updated} expert report{qcResult.updated !== 1 ? 's' : ''} updated with task data
                <div style={{ flex: 1 }} />
                <button className="btn-secondary" onClick={() => setQcResult(null)} style={{ fontSize: 12 }}>
                  Upload another
                </button>
              </div>

              {qcResult.notFound.length > 0 && (
                <div style={{ padding: '14px 18px', borderRadius: 10, background: '#1a0f0f', border: '1px solid #7f1d1d' }}>
                  <div style={{ color: '#f87171', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                    {qcResult.notFound.length} expert{qcResult.notFound.length !== 1 ? 's' : ''} not found in reports
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {qcResult.notFound.map(name => (
                      <span key={name} style={{
                        padding: '3px 10px', borderRadius: 6,
                        background: '#2d1515', border: '1px solid #7f1d1d',
                        color: '#fca5a5', fontSize: 12,
                      }}>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Edit Modal ── */}
      {editExpert && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget && !showConfirm) closeModal(); }}
        >
          <div className="modal" style={{ width: 500, maxWidth: '95vw', gap: 16 }}>
            <div className="modal-title-row">
              <div className="modal-title">Edit Expert</div>
              <button className="modal-x-btn" onClick={closeModal} disabled={saving}>✕</button>
            </div>

            {/* Read-only name */}
            <div className="inv-member-info">
              <div className="inv-info-row">
                <span className="inv-info-label">Name</span>
                <span className="inv-info-value" style={{ fontWeight: 700 }}>{editExpert.name}</span>
              </div>
            </div>

            {saveSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Expert updated successfully
              </div>
            )}

            {saveError && <div className="modal-error show">{saveError}</div>}

            {!saveSuccess && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {EDIT_FIELDS.map(({ key, label, placeholder }) => (
                    <div className="modal-field" key={key}>
                      <label>{label}</label>
                      <input
                        type="text"
                        value={editFields[key]}
                        onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ paddingLeft: 12 }}
                        disabled={saving}
                      />
                    </div>
                  ))}
                </div>

                <div className="modal-actions">
                  <button className="btn-secondary" onClick={closeModal} disabled={saving}>
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={saving}
                    style={{
                      padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: 'var(--accent)', color: '#fff', border: 'none',
                      cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Confirmation Modal ── */}
      {showConfirm && editExpert && (
        <div className="modal-overlay open" style={{ zIndex: 600 }}>
          <div className="modal" style={{ width: 380, maxWidth: '95vw', gap: 16 }}>
            <div className="modal-title">Confirm Update</div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Save changes to{' '}
              <strong style={{ color: 'var(--text)' }}>{editExpert.name}</strong>?
              This will overwrite their current details in the database.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowConfirm(false)} disabled={saving}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? <><span className="spinner" style={{ width: 13, height: 13 }} />Saving…</> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
