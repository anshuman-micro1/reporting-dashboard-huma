'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Offboarding {
  id: string;
  name: string;
  personalEmail: string | null;
  micro1Email: string | null;
  requestDate: string;
  isOffboarded: boolean;
  status: 'pending' | 'resolved';
  confirmationDate: string | null;
}

type ConfirmAction = { id: string; action: 'confirm' | 'cancel' | 'delete' } | null;

export default function OffboardingsPage() {
  const [rows, setRows] = useState<Offboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/offboardings')
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const handleAction = async (id: string, action: 'confirm' | 'cancel') => {
    setActioning(id + action);
    setConfirmAction(null);
    try {
      const res = await fetch('/api/offboardings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      const today = new Date().toISOString().slice(0, 10);
      setRows(prev => prev.map(r => {
        if (r.id !== id) return r;
        return action === 'confirm'
          ? { ...r, isOffboarded: true, status: 'resolved', confirmationDate: today }
          : { ...r, isOffboarded: false, status: 'pending', confirmationDate: null };
      }));
    } catch {
      // leave row unchanged on error
    } finally {
      setActioning(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActioning(id + 'delete');
    setConfirmAction(null);
    try {
      const res = await fetch('/api/offboardings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');
      setRows(prev => prev.filter(r => r.id !== id));
    } catch {
      // leave row unchanged on error
    } finally {
      setActioning(null);
    }
  };

  const pendingCount = rows.filter(r => r.status === 'pending').length;

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
          Offboardings
        </div>
        <div className="header-right">
          <Link href="/" className="btn-secondary" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            ← Dashboard
          </Link>
        </div>
      </header>

      <main>
        <div className="inv-page-header">
          <h2 className="inv-page-title">Expert Offboardings</h2>
          <span className="result-count">
            {!loading && `${rows.length} total · ${pendingCount} pending`}
          </span>
        </div>

        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Name</th>
                <th style={{ minWidth: 200 }}>Personal Email</th>
                <th style={{ minWidth: 200 }}>Micro1 Email</th>
                <th style={{ minWidth: 110 }}>Request Date</th>
                <th style={{ minWidth: 100 }}>Status</th>
                <th style={{ minWidth: 130 }}>Confirmation Date</th>
                <th style={{ minWidth: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="state-row"><td colSpan={7}><span className="spinner" />Loading…</td></tr>
              ) : error ? (
                <tr className="state-row"><td colSpan={7} style={{ color: '#f87171' }}>Error: {error}</td></tr>
              ) : rows.length === 0 ? (
                <tr className="state-row"><td colSpan={7}>No offboarding requests yet</td></tr>
              ) : (
                rows.map(row => {
                  const isConfirming = confirmAction?.id === row.id && confirmAction?.action === 'confirm';
                  const isCancelling = confirmAction?.id === row.id && confirmAction?.action === 'cancel';
                  const isDeleting = confirmAction?.id === row.id && confirmAction?.action === 'delete';
                  return (
                    <tr key={row.id} className={row.status === 'resolved' ? 'inv-row-closed' : ''}>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td className="dim">{row.personalEmail || '—'}</td>
                      <td className="dim">{row.micro1Email || '—'}</td>
                      <td className="dim">{row.requestDate}</td>
                      <td>
                        <span className={`offb-status-badge offb-status-${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="dim">{row.confirmationDate || '—'}</td>
                      <td>
                        <div className="offb-actions">
                          {/* Confirm Offboard — only for pending */}
                          {row.status === 'pending' && !isConfirming && (
                            <button
                              className="offb-confirm-btn"
                              disabled={!!actioning || isCancelling}
                              onClick={() => setConfirmAction({ id: row.id, action: 'confirm' })}
                            >
                              {actioning === row.id + 'confirm' ? 'Confirming…' : 'Confirm Offboard'}
                            </button>
                          )}
                          {row.status === 'pending' && isConfirming && (
                            <div className="inv-confirm-row">
                              <span className="inv-confirm-label" style={{ color: '#93c5fd' }}>Offboard?</span>
                              <button className="inv-confirm-yes" onClick={() => handleAction(row.id, 'confirm')}>Yes</button>
                              <button className="inv-confirm-no" onClick={() => setConfirmAction(null)}>No</button>
                            </div>
                          )}

                          {/* Cancel (delete) — for pending */}
                          {row.status === 'pending' && !isDeleting && (
                            <button
                              className="offb-cancel-btn"
                              disabled={!!actioning || isConfirming}
                              onClick={() => setConfirmAction({ id: row.id, action: 'delete' })}
                            >
                              {actioning === row.id + 'delete' ? 'Cancelling…' : 'Cancel'}
                            </button>
                          )}
                          {row.status === 'pending' && isDeleting && (
                            <div className="inv-confirm-row">
                              <span className="inv-confirm-label">Cancel request?</span>
                              <button className="inv-confirm-yes" onClick={() => handleDelete(row.id)}>Yes</button>
                              <button className="inv-confirm-no" onClick={() => setConfirmAction(null)}>No</button>
                            </div>
                          )}

                          {/* Cancel — disabled for resolved */}
                          {row.status === 'resolved' && (
                            <button className="offb-cancel-btn" disabled>Cancel</button>
                          )}
                        </div>
                      </td>
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
