'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const FIELDS = [
  { key: 'HUBSTAFF_XSRF_TOKEN',      label: 'XSRF Token',        cookie: 'XSRF-TOKEN' },
  { key: 'HUBSTAFF_SESSION',          label: 'Session',           cookie: '_hubstaff_session' },
  { key: 'HUBSTAFF_ACCOUNT_REFRESH',  label: 'Account Refresh',   cookie: 'hubstaff_account_refresh' },
  { key: 'HUBSTAFF_INGRESS_COOKIE',   label: 'Ingress Cookie',    cookie: 'INGRESSCOOKIE' },
  { key: 'HUBSTAFF_STRIPE_MID',       label: 'Stripe MID',        cookie: '__stripe_mid' },
  { key: 'HUBSTAFF_CSRF_TOKEN',       label: 'CSRF Token (POST)', cookie: null },
];

function extractCookiesFromHeader(cookieHeader: string, extraHeaders: Array<{name: string, value: string}>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name  = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    for (const field of FIELDS) {
      if (field.cookie && field.cookie === name) {
        result[field.key] = value;
      }
    }
  }
  for (const h of extraHeaders) {
    if (h.name.toLowerCase() === 'x-csrf-token') {
      result['HUBSTAFF_CSRF_TOKEN'] = h.value.trim();
    }
  }
  return result;
}

function parseHarCookies(harText: string): Record<string, string> {
  let har: { log?: { entries?: Array<{ request?: { url?: string; headers?: Array<{ name: string; value: string }> } }> } };
  try {
    har = JSON.parse(harText);
  } catch {
    throw new Error('Invalid HAR file — could not parse JSON');
  }

  const entries = har?.log?.entries ?? [];
  for (const entry of entries) {
    const url = entry?.request?.url ?? '';
    if (!url.includes('hubstaff.com')) continue;
    const headers = entry?.request?.headers ?? [];
    const cookieHeader = headers.find(h => h.name.toLowerCase() === 'cookie');
    if (!cookieHeader) continue;
    const extracted = extractCookiesFromHeader(cookieHeader.value, headers);
    if (Object.keys(extracted).length > 0) return extracted;
  }
  return {};
}

function parseCurlCookies(curlText: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Extract Cookie header value
  const cookieMatch = curlText.match(/-H\s+['"]Cookie:\s*([^'"]+)['"]/i);
  if (cookieMatch) {
    const cookieStr = cookieMatch[1];
    for (const part of cookieStr.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const name  = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      for (const field of FIELDS) {
        if (field.cookie && field.cookie === name) {
          result[field.key] = value;
        }
      }
    }
  }

  // Extract X-CSRF-Token header
  const csrfMatch = curlText.match(/-H\s+['"]X-CSRF-Token:\s*([^'"]+)['"]/i);
  if (csrfMatch) result['HUBSTAFF_CSRF_TOKEN'] = csrfMatch[1].trim();

  return result;
}

export default function SettingsPage() {
  const [values, setValues]     = useState<Record<string, string>>({});
  const [curl, setCurl]         = useState('');
  const [parsed, setParsed]     = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [harError, setHarError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => { setValues(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleHarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHarError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const extracted = parseHarCookies(ev.target?.result as string);
        if (Object.keys(extracted).length === 0) {
          setHarError('No Hubstaff cookies found in HAR — make sure you exported from app.hubstaff.com');
          return;
        }
        setParsed(prev => ({ ...prev, ...extracted }));
        setValues(prev => ({ ...prev, ...extracted }));
      } catch (err: unknown) {
        setHarError(err instanceof Error ? err.message : 'Failed to parse HAR file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleParse = () => {
    if (!curl.trim()) return;
    const extracted = parseCurlCookies(curl);
    setParsed(extracted);
    setValues(prev => ({ ...prev, ...extracted }));
    setCurl('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setSaved(true);
      setParsed({});
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const parsedCount = Object.keys(parsed).length;

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
          Settings
        </div>
        <div className="header-right">
          <Link href="/" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            ← Dashboard
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '24px' }}>
        <div className="inv-page-header" style={{ marginBottom: 24 }}>
          <h2 className="inv-page-title">Hubstaff Credentials</h2>
        </div>

        {/* HAR upload */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 18, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Import from HAR file
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            In DevTools → Network tab, right-click any request → <strong style={{ color: 'var(--text)' }}>Save all as HAR with content</strong>. Upload the file below — all cookies including HttpOnly are captured automatically.
          </p>
          <label style={{
            display: 'inline-block', padding: '7px 18px', borderRadius: 8,
            fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: '#fff',
            cursor: 'pointer',
          }}>
            Upload .har file
            <input type="file" accept=".har,application/json" onChange={handleHarUpload} style={{ display: 'none' }} />
          </label>
          {harError && <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>{harError}</div>}
        </div>

        {/* Curl paste box */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 18, marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Paste curl from DevTools
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            In your browser, open DevTools → Network → click any Hubstaff request → right-click → Copy → Copy as cURL. Paste it below.
          </p>
          <textarea
            value={curl}
            onChange={e => setCurl(e.target.value)}
            placeholder="curl 'https://app.hubstaff.com/...' -H 'Cookie: ...' ..."
            rows={5}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 12px',
              color: 'var(--text)', fontSize: 12, fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button
              onClick={handleParse}
              disabled={!curl.trim()}
              style={{
                padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'var(--accent)', color: '#fff', border: 'none',
                cursor: curl.trim() ? 'pointer' : 'not-allowed', opacity: curl.trim() ? 1 : 0.5,
              }}
            >
              Extract Values
            </button>
            {parsedCount > 0 && (
              <span style={{ fontSize: 12, color: '#4ade80' }}>
                ✓ {parsedCount} value{parsedCount !== 1 ? 's' : ''} extracted
              </span>
            )}
          </div>
        </div>

        {/* Individual fields */}
        {!loading && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 18, marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
              Cookie Values
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FIELDS.map(field => (
                <div key={field.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {field.label}
                    </label>
                    {parsed[field.key] && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 4, background: '#0d2318', color: '#4ade80',
                        border: '1px solid #166534',
                      }}>updated</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={values[field.key] || ''}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: parsed[field.key] ? '#0d1f0d' : 'var(--bg)',
                      border: `1px solid ${parsed[field.key] ? '#166534' : 'var(--border)'}`,
                      borderRadius: 7, padding: '8px 12px',
                      color: 'var(--text)', fontSize: 12, fontFamily: 'monospace',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="modal-error show" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--accent)', color: '#fff', border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
          {saved && <span style={{ fontSize: 13, color: '#4ade80' }}>✓ Saved — credentials updated in DB</span>}
        </div>
      </main>
    </>
  );
}
