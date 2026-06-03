'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '../../components/ui/Button';

interface UserRow {
  id:          string;
  email:       string;
  name:        string;
  role:        'admin' | 'user';
  isActive:    boolean;
  hasPassword: boolean;
  createdAt:   string;
}

const ROLES: Array<'admin' | 'user'> = ['admin', 'user'];

export default function UsersPage() {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Add user modal
  const [showAdd,   setShowAdd]   = useState(false);
  const [addEmail,  setAddEmail]  = useState('');
  const [addName,   setAddName]   = useState('');
  const [addRole,   setAddRole]   = useState<'admin' | 'user'>('user');
  const [addPass,   setAddPass]   = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError,  setAddError]  = useState('');

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPass,   setResetPass]   = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError,  setResetError]  = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setUsers(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (user: UserRow, role: 'admin' | 'user') => {
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, role }),
    });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role } : u));
  };

  const handleToggleActive = async (user: UserRow) => {
    const isActive = !user.isActive;
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, isActive }),
    });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive } : u));
  };

  const handleDelete = async (user: UserRow) => {
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Delete failed'); return; }
    setUsers(prev => prev.filter(u => u.id !== user.id));
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddSaving(true);
    setAddError('');
    try {
      const res  = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail, name: addName, role: addRole, password: addPass || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      setShowAdd(false);
      setAddEmail(''); setAddName(''); setAddRole('user'); setAddPass('');
      fetchUsers();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAddSaving(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetSaving(true);
    setResetError('');
    try {
      const res  = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resetTarget.id, password: resetPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResetTarget(null);
      setResetPass('');
    } catch (e: unknown) {
      setResetError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setResetSaving(false);
    }
  };

  const inputCls = 'w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[7px] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors';

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
          User Management
        </div>
        <div className="header-right">
          <Link href="/">
            <Button variant="ghost">← Dashboard</Button>
          </Link>
        </div>
      </header>

      <main>
        <div className="inv-page-header">
          <h2 className="inv-page-title">Users</h2>
          <div className="flex items-center gap-3">
            {!loading && (
              <span className="result-count">{users.length} user{users.length !== 1 ? 's' : ''}</span>
            )}
            <Button onClick={() => { setShowAdd(true); setAddError(''); }}>
              + Add User
            </Button>
          </div>
        </div>

        {error && <div className="modal-error show mb-4">{error}</div>}

        <div className="table-wrap">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Auth</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="state-row"><td colSpan={7}><span className="spinner" />Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr className="state-row"><td colSpan={7}>No users yet</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className={!user.isActive ? 'inv-row-closed' : ''}>
                    <td className="px-4 py-3 font-semibold">{user.name}</td>
                    <td className="px-4 py-3 dim text-[12px]">{user.email}</td>

                    {/* Role selector */}
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={e => handleRoleChange(user, e.target.value as 'admin' | 'user')}
                        className="hdm-select"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>

                    {/* Auth method badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-semibold px-2 py-[2px] rounded-[5px] border ${
                        user.hasPassword
                          ? 'bg-[#1a2840] text-[#93c5fd] border-[#1e3a8a]'
                          : 'bg-[#0d2318] text-[#6ee7b7] border-[#065f46]'
                      }`}>
                        {user.hasPassword ? 'Password' : 'Google'}
                      </span>
                    </td>

                    {/* Active toggle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`text-[11px] font-semibold px-2.5 py-[2px] rounded-[5px] border cursor-pointer transition-colors ${
                          user.isActive
                            ? 'bg-[#0d2318] text-[#4ade80] border-[#166534] hover:bg-[#0f2e20]'
                            : 'bg-[#1a0a0a] text-[#f87171] border-[#7f1d1d] hover:bg-[#220c0c]'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    <td className="px-4 py-3 dim text-[11px]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setResetTarget(user); setResetPass(''); setResetError(''); }}
                          className="text-[11px] font-medium px-2.5 py-1 rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-soft)] cursor-pointer transition-colors"
                        >
                          Reset pw
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="text-[11px] font-medium px-2.5 py-1 rounded-[5px] border border-[#7f1d1d] bg-[#1a0a0a] text-[#f87171] hover:bg-[#220c0c] cursor-pointer transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* ── Add User Modal ── */}
      {showAdd && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="modal" style={{ width: 440, maxWidth: '95vw', gap: 16 }}>
            <div className="modal-title-row">
              <div className="modal-title">Add User</div>
              <button className="modal-x-btn" onClick={() => setShowAdd(false)}>✕</button>
            </div>

            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="modal-field">
                <label>Name</label>
                <input type="text" required placeholder="Jane Smith" value={addName} onChange={e => setAddName(e.target.value)} className={inputCls} />
              </div>
              <div className="modal-field">
                <label>Email</label>
                <input type="email" required placeholder="jane@micro1.ai" value={addEmail} onChange={e => setAddEmail(e.target.value)} className={inputCls} />
              </div>
              <div className="modal-field">
                <label>Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value as 'admin' | 'user')} className={`${inputCls} cursor-pointer`}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="modal-field">
                <label>Password <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(optional — leave blank for Google-only)</span></label>
                <input type="password" placeholder="Min 8 characters" value={addPass} onChange={e => setAddPass(e.target.value)} className={inputCls} />
              </div>

              {addError && <div className="modal-error show">{addError}</div>}

              <div className="modal-actions">
                <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={addSaving}>
                  {addSaving ? 'Creating…' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetTarget && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setResetTarget(null); }}>
          <div className="modal" style={{ width: 380, maxWidth: '95vw', gap: 16 }}>
            <div className="modal-title-row">
              <div className="modal-title">Reset Password</div>
              <button className="modal-x-btn" onClick={() => setResetTarget(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Set a new password for <strong style={{ color: 'var(--text)' }}>{resetTarget.email}</strong>
            </p>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="modal-field">
                <label>New Password</label>
                <input type="password" required minLength={8} placeholder="Min 8 characters" value={resetPass} onChange={e => setResetPass(e.target.value)} className={inputCls} />
              </div>
              {resetError && <div className="modal-error show">{resetError}</div>}
              <div className="modal-actions">
                <Button variant="secondary" type="button" onClick={() => setResetTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={resetSaving}>
                  {resetSaving ? 'Saving…' : 'Save Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
