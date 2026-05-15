'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

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
  // Strip non-ASCII (emoji, special chars) then lowercase + collapse spaces
  return h.replace(/[^\x00-\x7F]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCsv(text: string): { rows: ParsedRow[]; error: string } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'CSV must have a header row and at least one data row.' };

  const headers = tokeniseRow(lines[0]).map(normaliseHeader);

  const idx = {
    name:          headers.findIndex(h => h === 'member name'),
    personalEmail: headers.findIndex(h => h === 'personal email'),
    // Accept both "micro1 email" (actual CSV) and "expert email"
    expertEmail:   headers.findIndex(h => h === 'micro1 email' || h === 'expert email'),
    // HDM column may have an emoji suffix — match by prefix
    hdm:           headers.findIndex(h => h === 'hdm' || h.startsWith('hdm')),
    team:          headers.findIndex(h => h === 'team'),
  };

  // team is optional — don't fail if missing
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

export default function MembersUploadPage() {
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

        {/* Sync result */}
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
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
              ({syncResult.total} fetched from Hubstaff)
            </span>
            <button className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setSyncResult(null)}>✕</button>
          </div>
        )}
        {syncError && (
          <div className="modal-error show" style={{ marginBottom: 16 }}>{syncError}</div>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
          Upload a CSV with columns: <strong style={{ color: 'var(--text)' }}>Member Name</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>Personal Email</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>Micro1 Email</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>HDM</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>Team</strong> (optional).
          Experts are matched by name (case-insensitive). Unmatched names are listed at the end.
        </p>

        {/* File picker */}
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
            {fileName && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{fileName}</span>}
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

        {parseError && (
          <div className="modal-error show" style={{ marginBottom: 16 }}>{parseError}</div>
        )}
        {apiError && (
          <div className="modal-error show" style={{ marginBottom: 16 }}>{apiError}</div>
        )}

        {/* Result banner */}
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

        {/* Preview table */}
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
      </main>
    </>
  );
}
