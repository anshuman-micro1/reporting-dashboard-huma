'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import InvestigationsTable from '../../components/investigations/InvestigationsTable';
import { Button } from '../../components/ui/Button';

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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.length >= 4 || value.length === 0) {
      searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
    }
  };

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

  const filteredRows = rows
    .filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!debouncedSearch.trim()) return true;
      const q = debouncedSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.personalEmail ?? '').toLowerCase().includes(q) ||
        (r.micro1Email ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === 'open' ? -1 : 1;
    });

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
          <Link href="/">
            <Button variant="ghost">← Dashboard</Button>
          </Link>
        </div>
      </header>

      <main>
        <div className="inv-page-header">
          <h2 className="inv-page-title">Expert Investigations</h2>
          <span className="result-count">
            {!loading && `${rows.length} total · ${openCount} open`}
          </span>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            className="search-box flex-1"
            type="text"
            placeholder="Search by name or email (min 4 chars)…"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
          <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
            {(['all', 'open', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3.5 text-[12px] font-semibold capitalize transition-colors border-none cursor-pointer ${
                  statusFilter === s
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <InvestigationsTable
          rows={filteredRows}
          loading={loading}
          error={error}
          confirmClose={confirmClose}
          closing={closing}
          onSetConfirmClose={setConfirmClose}
          onClose={handleClose}
        />
      </main>
    </>
  );
}
