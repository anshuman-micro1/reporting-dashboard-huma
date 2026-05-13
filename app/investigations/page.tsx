'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Investigation {
  id: string;
  name: string;
  personalEmail: string | null;
  micro1Email: string | null;
  notes: string;
  investigationDate: string;
  status: 'open' | 'closed';
}

export default function InvestigationsPage() {
  const [rows, setRows] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/investigations')
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const handleClose = async (id: string) => {
    setClosing(id);
    setConfirmClose(null);
    try {
      const res = await fetch('/api/investigations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'closed' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'closed' } : r));
    } catch {
      // silently leave the row unchanged on error
    } finally {
      setClosing(null);
    }
  };

  const openCount = rows.filter(r => r.status === 'open').length;

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
          Investigations
        </div>
        <div className="header-right">
          <Link href="/" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            ← Dashboard
          </Link>
        </div>
      </header>

      <main>
        <div className="inv-page-header">
          <h2 className="inv-page-title">Member Investigations</h2>
          <span className="result-count">
            {!loading && `${rows.length} total · ${openCount} open`}
          </span>
        </div>

        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Name</th>
                <th style={{ minWidth: 210 }}>Personal Email</th>
                <th style={{ minWidth: 210 }}>Micro1 Email</th>
                <th style={{ minWidth: 120 }}>Date</th>
                <th style={{ minWidth: 90 }}>Status</th>
                <th style={{ minWidth: 300 }}>Notes</th>
                <th style={{ minWidth: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="state-row">
                  <td colSpan={7}><span className="spinner" />Loading…</td>
                </tr>
              ) : error ? (
                <tr className="state-row">
                  <td colSpan={7} style={{ color: '#f87171' }}>Error: {error}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr className="state-row">
                  <td colSpan={7}>No investigations yet</td>
                </tr>
              ) : (
                rows.map(inv => (
                  <tr key={inv.id} className={inv.status === 'closed' ? 'inv-row-closed' : ''}>
                    <td style={{ fontWeight: 600 }}>{inv.name}</td>
                    <td className="dim">{inv.personalEmail || '—'}</td>
                    <td className="dim">{inv.micro1Email || '—'}</td>
                    <td className="dim">{inv.investigationDate}</td>
                    <td>
                      <span className={`inv-status-badge inv-status-${inv.status}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{inv.notes}</td>
                    <td>
                      {inv.status === 'open' && confirmClose !== inv.id && (
                        <button
                          className="inv-close-btn"
                          disabled={closing === inv.id}
                          onClick={() => setConfirmClose(inv.id)}
                        >
                          {closing === inv.id ? 'Closing…' : 'Close'}
                        </button>
                      )}
                      {inv.status === 'open' && confirmClose === inv.id && (
                        <div className="inv-confirm-row">
                          <span className="inv-confirm-label">Close?</span>
                          <button className="inv-confirm-yes" onClick={() => handleClose(inv.id)}>Yes</button>
                          <button className="inv-confirm-no" onClick={() => setConfirmClose(null)}>No</button>
                        </div>
                      )}
                      {inv.status === 'closed' && (
                        <span className="dim" style={{ fontSize: 11 }}>Closed</span>
                      )}
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
