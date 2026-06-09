"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

interface QCRow { _id?: string; date: string; expertName?: string; expertEmail?: string; assignedHDM?: string; notes?: string }

export default function QCDashboard() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const [rows, setRows] = useState<QCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
    setMessage('');
    try {
      const res = await fetch('/api/qc', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setMessage('Sheet sync completed.');
      await fetchList();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unknown'); }
    finally { setSyncing(false); }
  }

  async function handleExcelUpload() {
    if (!selectedFile) {
      setError('Choose an Excel or CSV file first.');
      return;
    }
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/qc/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMessage(`Upload completed. Upserted: ${data.result?.upserted ?? 0}, modified: ${data.result?.modified ?? 0}, rejected: ${data.rejected ?? 0}`);
      setSelectedFile(null);
      await fetchList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>QC Dashboard</h1>
        <div>
          <Button onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync from Sheet'}</Button>
        </div>
      </header>

      {error && <div style={{ color: 'red' }}>{error}</div>}
      {message && <div style={{ color: 'var(--text-dim)' }}>{message}</div>}

      {isAdmin && (
        <section style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Excel / CSV Upload</h2>
          <p style={{ marginTop: 6, color: 'var(--text-dim)', fontSize: 13 }}>
            Admins can upload an Excel export directly. The file is parsed and saved into the QC collection.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
            />
            <Button variant="secondary" onClick={handleExcelUpload} disabled={uploading || !selectedFile}>
              {uploading ? 'Uploading…' : 'Upload Excel'}
            </Button>
            {selectedFile && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{selectedFile.name}</span>}
          </div>
        </section>
      )}

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
