"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface QCRow { _id?: string; date: string; expertName?: string; expertEmail?: string; assignedHDM?: string; notes?: string }

export default function QCDashboard() {
  const { data: session } = useSession();
  const [rows, setRows] = useState<QCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchList(); }, []);

  async function fetchList() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/qc');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unknown'); }
    finally { setLoading(false); }
  }

  async function handleSync() {
    setSyncing(true); setError('');
    try {
      const res = await fetch('/api/qc', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      await fetchList();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unknown'); }
    finally { setSyncing(false); }
  }

  return (
    <div style={{ padding: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>QC Dashboard</h1>
        <div>
          <button onClick={handleSync} disabled={syncing} className="btn-primary">{syncing ? 'Syncing…' : 'Sync from Sheet'}</button>
        </div>
      </header>

      {error && <div style={{ color: 'red' }}>{error}</div>}

      <section style={{ marginTop: 16 }}>
        {loading ? <div>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Date</th>
                <th>Expert</th>
                <th>Expert Email</th>
                <th>Assigned HDM</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r._id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{r.date}</td>
                  <td>{r.expertName}</td>
                  <td>{r.expertEmail}</td>
                  <td>{r.assignedHDM}</td>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 400 }}>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
