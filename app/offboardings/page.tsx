'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import OffboardingsTable from '../../components/offboardings/OffboardingsTable';
import { Button } from '../../components/ui/Button';

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
          <Link href="/">
            <Button variant="ghost">← Dashboard</Button>
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

        <OffboardingsTable
          rows={rows}
          loading={loading}
          error={error}
          confirmAction={confirmAction}
          actioning={actioning}
          onSetConfirmAction={setConfirmAction}
          onAction={handleAction}
          onDelete={handleDelete}
        />
      </main>
    </>
  );
}
