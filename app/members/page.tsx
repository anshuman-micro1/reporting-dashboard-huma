'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import MemberTable from '../../components/members/MemberTable';
import { Button } from '../../components/ui/Button';

// ── types ──────────────────────────────────────────────────────────────────

interface Expert {
  id: string;
  name: string;
  personalEmail: string | null;
  micro1Email: string | null;
  hdm: string | null;
  team: string | null;
}

interface UnmatchedMember {
  id: string;
  name: string;
  personalEmail: string | null;
  micro1Email: string | null;
  hdm: string | null;
  app: string | null;
  status: string | null;
}

interface HubstaffMember {
  id: number;
  name: string;
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
  updated:      number;
  fuzzyMatched: { csvName: string; matchedTo: string }[];
  notFound:     string[];
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

interface PendingMappingEntry {
  _id: string;
  hubstaffName:        string;
  suggestedMemberName: string | null;
  suggestedMemberId:   string | null;
  score:               number | null;
  autoApplied:         boolean;
  lastSeen:            string;
}

// ── helpers ────────────────────────────────────────────────────────────────

function scoreLabel(score: number | null): string {
  if (score === null) return '';
  if (score <= 0.3) return 'High confidence';
  if (score <= 0.5) return 'Med confidence';
  return 'Low confidence';
}

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-dim)';
  if (score <= 0.3) return '#4ade80';
  if (score <= 0.5) return '#fbbf24';
  return '#f87171';
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
  // ── user mapping ────────────────────────────────────────────────────────
  const [mappingTab, setMappingTab]               = useState<'hubstaff' | 'hdm'>('hubstaff');
  const [unmatchedLoaded, setUnmatchedLoaded]     = useState(false);
  const [unmatchedLoading, setUnmatchedLoading]   = useState(false);
  const [noHubstaff, setNoHubstaff]               = useState<UnmatchedMember[]>([]);
  const [noHDM, setNoHDM]                         = useState<UnmatchedMember[]>([]);
  const [hdmList, setHdmList]                     = useState<string[]>([]);
  const [linkedHubstaffIds, setLinkedHubstaffIds] = useState<Set<number>>(new Set());
  const [hubstaffMembers, setHubstaffMembers]     = useState<HubstaffMember[]>([]);
  const [hubstaffFetching, setHubstaffFetching]   = useState(false);
  const [hubstaffFetchErr, setHubstaffFetchErr]   = useState('');
  const [dbSearch, setDbSearch]                   = useState('');
  const [hsSearch, setHsSearch]                   = useState('');
  const [selectedDb, setSelectedDb]               = useState<UnmatchedMember | null>(null);
  const [linking, setLinking]                     = useState(false);
  const [hdmAssign, setHdmAssign]                 = useState<Record<string, string>>({});
  const [hdmSaving, setHdmSaving]                 = useState<string | null>(null);
  const [hdmSearch, setHdmSearch]                 = useState('');

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

  // pending name mappings
  const [pendingMappings, setPendingMappings]     = useState<PendingMappingEntry[]>([]);
  const [pendingLoaded, setPendingLoaded]         = useState(false);
  const [activeSearchHub, setActiveSearchHub]     = useState<string | null>(null);
  const [mappingQuery, setMappingQuery]           = useState('');
  const [mappingResults, setMappingResults]       = useState<Expert[]>([]);
  const [mappingSearching, setMappingSearching]   = useState(false);
  const [mappingSelected, setMappingSelected]     = useState<Record<string, Expert>>({});
  const [mappingActing, setMappingActing]         = useState<string | null>(null);
  const mappingSearchRef                          = useRef<HTMLDivElement>(null);

  // qc tracking upload
  const [qcRows, setQcRows]           = useState<QCParsedRow[]>([]);
  const [qcFileName, setQcFileName]   = useState('');
  const [qcParseError, setQcParseError] = useState('');
  const [qcUploading, setQcUploading] = useState(false);
  const [qcResult, setQcResult]       = useState<QCUploadResult | null>(null);
  const [qcApiError, setQcApiError]   = useState('');
  const qcFileRef = useRef<HTMLInputElement>(null);

  // load unmatched members on mount
  useEffect(() => {
    setUnmatchedLoading(true);
    fetch('/api/members/unmatched')
      .then(r => r.json())
      .then(data => {
        if (data.noHubstaff) setNoHubstaff(data.noHubstaff);
        if (data.noHDM)      setNoHDM(data.noHDM);
        if (data.hdmList)    setHdmList(data.hdmList);
        if (data.linkedHubstaffIds) setLinkedHubstaffIds(new Set(data.linkedHubstaffIds));
        setUnmatchedLoaded(true);
      })
      .catch(() => setUnmatchedLoaded(true))
      .finally(() => setUnmatchedLoading(false));
  }, []);

  const fetchHubstaffMembers = async () => {
    setHubstaffFetching(true);
    setHubstaffFetchErr('');
    try {
      const res = await fetch('/api/members/sync');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setHubstaffMembers(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setHubstaffFetchErr(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setHubstaffFetching(false);
    }
  };

  const handleLinkHubstaff = async (dbMember: UnmatchedMember, hsMember: HubstaffMember) => {
    setLinking(true);
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dbMember.id, hubstaffId: hsMember.id, hubstaffName: hsMember.name }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed');
      setNoHubstaff(prev => prev.filter(m => m.id !== dbMember.id));
      setLinkedHubstaffIds(prev => new Set([...prev, hsMember.id]));
      if (selectedDb?.id === dbMember.id) setSelectedDb(null);
    } finally {
      setLinking(false);
    }
  };

  const handleAssignHDM = async (memberId: string, hdmName: string) => {
    setHdmSaving(memberId);
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memberId, hdm: hdmName }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed');
      setNoHDM(prev => prev.filter(m => m.id !== memberId));
      setHdmAssign(prev => { const n = { ...prev }; delete n[memberId]; return n; });
    } finally {
      setHdmSaving(null);
    }
  };

  // load pending mappings on mount
  useEffect(() => {
    fetch('/api/members/pending-mappings')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPendingMappings(data); })
      .finally(() => setPendingLoaded(true));
  }, []);

  // mapping search debounce
  useEffect(() => {
    if (!activeSearchHub || mappingQuery.trim().length < 4) {
      setMappingResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setMappingSearching(true);
      try {
        const res = await fetch(`/api/members?q=${encodeURIComponent(mappingQuery.trim())}`);
        const data = await res.json();
        setMappingResults(Array.isArray(data) ? data : []);
      } catch { setMappingResults([]); }
      finally { setMappingSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [mappingQuery, activeSearchHub]);

  // search debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 4) {
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

  const handleConfirmMapping = async (hubstaffName: string, memberId: string) => {
    setMappingActing(hubstaffName);
    try {
      const res = await fetch('/api/members/pending-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubstaffName, memberId }),
      });
      const data = await res.json();
      if (!data.ok) return;
      setPendingMappings(prev => prev.filter(m => m.hubstaffName !== hubstaffName));
      setMappingSelected(prev => { const n = { ...prev }; delete n[hubstaffName]; return n; });
      setActiveSearchHub(null);
      setMappingQuery('');
    } finally {
      setMappingActing(null);
    }
  };

  const handleDismissMapping = async (hubstaffName: string) => {
    setMappingActing(hubstaffName + '_d');
    try {
      await fetch(`/api/members/pending-mappings?hubstaffName=${encodeURIComponent(hubstaffName)}`, { method: 'DELETE' });
      setPendingMappings(prev => prev.filter(m => m.hubstaffName !== hubstaffName));
    } finally {
      setMappingActing(null);
    }
  };

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

  // Fuse.js for Hubstaff name matching
  const hsFuse = useMemo(() => {
    const available = hubstaffMembers.filter(m => !linkedHubstaffIds.has(m.id));
    return new Fuse(available, { keys: ['name'], includeScore: true, threshold: 0.5, ignoreLocation: true });
  }, [hubstaffMembers, linkedHubstaffIds]);

  const suggestedHsId = useMemo(() => {
    if (!selectedDb || hubstaffMembers.length === 0) return null;
    const hits = hsFuse.search(selectedDb.name);
    return hits.length > 0 ? hits[0].item.id : null;
  }, [selectedDb, hsFuse, hubstaffMembers]);

  const filteredNoHubstaff = useMemo(() => {
    if (!dbSearch.trim()) return noHubstaff;
    const q = dbSearch.toLowerCase();
    return noHubstaff.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.micro1Email ?? '').toLowerCase().includes(q) ||
      (m.personalEmail ?? '').toLowerCase().includes(q)
    );
  }, [noHubstaff, dbSearch]);

  const filteredHubstaffMembers = useMemo(() => {
    const available = hubstaffMembers.filter(m => !linkedHubstaffIds.has(m.id));
    if (!hsSearch.trim()) return available;
    const q = hsSearch.toLowerCase();
    return available.filter(m => m.name.toLowerCase().includes(q));
  }, [hubstaffMembers, linkedHubstaffIds, hsSearch]);

  const filteredNoHDM = useMemo(() => {
    if (!hdmSearch.trim()) return noHDM;
    const q = hdmSearch.toLowerCase();
    return noHDM.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.micro1Email ?? '').toLowerCase().includes(q)
    );
  }, [noHDM, hdmSearch]);

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

  const dropdownVisible = showDropdown && searchQuery.trim().length >= 4;

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
          <Link href="/">
            <Button variant="ghost">← Dashboard</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-6">

        {/* ── User Mapping ── */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] p-[18px] mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)] mb-[2px]">
                User Mapping
                {unmatchedLoaded && (noHubstaff.length > 0 || noHDM.length > 0) && (
                  <span className="ml-2 px-2 py-[2px] rounded bg-[var(--accent)] text-white text-[11px] font-bold">
                    {noHubstaff.length + noHDM.length} unmatched
                  </span>
                )}
              </div>
              <div className="text-[12px] text-[var(--text-dim)]">
                Link experts to Hubstaff accounts and assign HDMs.
              </div>
            </div>
            {unmatchedLoading && <span className="spinner" style={{ width: 13, height: 13 }} />}
          </div>

          {/* Sub-tab bar */}
          <div className="flex gap-1 mb-4 border-b border-[var(--border)] pb-0">
            {(['hubstaff', 'hdm'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setMappingTab(tab)}
                className={`px-4 py-[7px] text-[12px] font-semibold rounded-t-[6px] border-none cursor-pointer transition-colors ${
                  mappingTab === tab
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-transparent text-[var(--text-dim)] hover:text-[var(--text)]'
                }`}
              >
                {tab === 'hubstaff'
                  ? `Hubstaff Matching${noHubstaff.length > 0 ? ` (${noHubstaff.length})` : ''}`
                  : `HDM Assignment${noHDM.length > 0 ? ` (${noHDM.length})` : ''}`
                }
              </button>
            ))}
          </div>

          {/* ── Hubstaff Matching Tab ── */}
          {mappingTab === 'hubstaff' && (
            <div>
              {noHubstaff.length === 0 && unmatchedLoaded ? (
                <div className="text-[13px] text-[var(--text-dim)] py-4 text-center">
                  All experts are linked to Hubstaff.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[12px] text-[var(--text-dim)]">
                      {noHubstaff.length} expert{noHubstaff.length !== 1 ? 's' : ''} without Hubstaff link
                    </span>
                    <div className="flex-1" />
                    {hubstaffMembers.length === 0 ? (
                      <button
                        onClick={fetchHubstaffMembers}
                        disabled={hubstaffFetching}
                        className={`px-4 py-[7px] rounded-[6px] text-[12px] font-semibold bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] inline-flex items-center gap-2 ${hubstaffFetching ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-[var(--accent)]'}`}
                      >
                        {hubstaffFetching
                          ? <><span className="spinner" style={{ width: 11, height: 11 }} />Loading Hubstaff…</>
                          : <><img src="/icons8-hubstaff-240.png" width="14" height="14" alt="" style={{ borderRadius: 3 }} />Load Hubstaff Members</>
                        }
                      </button>
                    ) : (
                      <span className="text-[12px] text-[var(--text-dim)]">
                        {filteredHubstaffMembers.length} Hubstaff members available
                      </span>
                    )}
                  </div>

                  {hubstaffFetchErr && <div className="modal-error show mb-3">{hubstaffFetchErr}</div>}

                  {hubstaffMembers.length > 0 && (
                    <div className="flex gap-3" style={{ minHeight: 320 }}>
                      {/* Left: DB members without Hubstaff */}
                      <div className="flex-1 flex flex-col">
                        <div className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-2">
                          DB Members (No Hubstaff Link)
                        </div>
                        <input
                          type="text"
                          value={dbSearch}
                          onChange={e => setDbSearch(e.target.value)}
                          placeholder="Search…"
                          className="pl-3 mb-2 text-[12px]"
                          style={{ height: 32 }}
                        />
                        <div className="flex flex-col gap-1 overflow-y-auto flex-1" style={{ maxHeight: 280 }}>
                          {filteredNoHubstaff.map(m => {
                            const isSelected = selectedDb?.id === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => setSelectedDb(isSelected ? null : m)}
                                className={`px-3 py-[8px] rounded-[6px] cursor-pointer border transition-colors ${
                                  isSelected
                                    ? 'border-[var(--accent)] bg-[rgba(99,102,241,0.12)]'
                                    : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]'
                                }`}
                              >
                                <div className="text-[12px] font-semibold text-[var(--text)]">{m.name}</div>
                                <div className="text-[11px] text-[var(--text-dim)] mt-[2px]">
                                  {m.micro1Email ?? m.personalEmail ?? 'No email'}
                                </div>
                              </div>
                            );
                          })}
                          {filteredNoHubstaff.length === 0 && (
                            <div className="text-[12px] text-[var(--text-dim)] text-center py-4">No results</div>
                          )}
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="flex flex-col items-center pt-8 gap-2">
                        <div className="w-px flex-1 bg-[var(--border)]" />
                        <div className="text-[18px] text-[var(--text-dim)]">→</div>
                        <div className="w-px flex-1 bg-[var(--border)]" />
                      </div>

                      {/* Right: Hubstaff members */}
                      <div className="flex-1 flex flex-col">
                        <div className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-2">
                          Hubstaff Members {selectedDb && <span className="text-[var(--accent)]">— click to link to "{selectedDb.name}"</span>}
                        </div>
                        <input
                          type="text"
                          value={hsSearch}
                          onChange={e => setHsSearch(e.target.value)}
                          placeholder="Search…"
                          className="pl-3 mb-2 text-[12px]"
                          style={{ height: 32 }}
                        />
                        <div className="flex flex-col gap-1 overflow-y-auto flex-1" style={{ maxHeight: 280 }}>
                          {filteredHubstaffMembers.map(m => {
                            const isSuggested = m.id === suggestedHsId;
                            return (
                              <div
                                key={m.id}
                                onClick={() => {
                                  if (!selectedDb || linking) return;
                                  handleLinkHubstaff(selectedDb, m);
                                }}
                                className={`px-3 py-[8px] rounded-[6px] border transition-colors ${
                                  selectedDb
                                    ? isSuggested
                                      ? 'border-[#34d399] bg-[rgba(52,211,153,0.08)] cursor-pointer'
                                      : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] cursor-pointer'
                                    : 'border-[var(--border)] opacity-60 cursor-default'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-semibold text-[var(--text)]">{m.name}</span>
                                  {isSuggested && selectedDb && (
                                    <span className="text-[10px] px-[6px] py-[2px] rounded bg-[#34d399] text-black font-bold">BEST MATCH</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[var(--text-dim)] mt-[2px]">ID: {m.id}</div>
                              </div>
                            );
                          })}
                          {filteredHubstaffMembers.length === 0 && (
                            <div className="text-[12px] text-[var(--text-dim)] text-center py-4">No results</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {hubstaffMembers.length === 0 && !hubstaffFetching && (
                    <div className="text-[12px] text-[var(--text-dim)] text-center py-6">
                      Load Hubstaff members to start matching.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── HDM Assignment Tab ── */}
          {mappingTab === 'hdm' && (
            <div>
              {noHDM.length === 0 && unmatchedLoaded ? (
                <div className="text-[13px] text-[var(--text-dim)] py-4 text-center">
                  All experts have an HDM assigned.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <input
                      type="text"
                      value={hdmSearch}
                      onChange={e => setHdmSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="pl-3 text-[12px] flex-1"
                      style={{ height: 32, maxWidth: 300 }}
                    />
                    <span className="text-[12px] text-[var(--text-dim)] ml-auto">
                      {filteredNoHDM.length} expert{filteredNoHDM.length !== 1 ? 's' : ''} without HDM
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {filteredNoHDM.map(m => {
                      const assigned = hdmAssign[m.id] ?? '';
                      const isSaving = hdmSaving === m.id;
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-3 py-[10px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]"
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[12px] font-semibold text-[var(--text)]">{m.name}</span>
                            <span className="text-[11px] text-[var(--text-dim)]">
                              {m.micro1Email ?? m.personalEmail ?? 'No email'}
                              {m.app ? <span className="ml-2 opacity-60">{m.app}</span> : null}
                            </span>
                          </div>
                          <select
                            value={assigned}
                            onChange={e => setHdmAssign(prev => ({ ...prev, [m.id]: e.target.value }))}
                            className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-[12px] rounded-[6px] px-2 py-[6px] cursor-pointer"
                            style={{ minWidth: 160 }}
                            disabled={isSaving}
                          >
                            <option value="">Select HDM…</option>
                            {hdmList.map(hdm => (
                              <option key={hdm} value={hdm}>{hdm}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => { if (assigned) handleAssignHDM(m.id, assigned); }}
                            disabled={!assigned || isSaving}
                            className={`px-4 py-[6px] rounded-[6px] text-[12px] font-semibold border-none inline-flex items-center gap-1.5 ${
                              assigned && !isSaving
                                ? 'bg-[var(--accent)] text-white cursor-pointer'
                                : 'bg-[var(--surface)] text-[var(--text-dim)] cursor-not-allowed opacity-50'
                            }`}
                          >
                            {isSaving ? <><span className="spinner" style={{ width: 11, height: 11 }} />Saving…</> : 'Save'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Pending Name Mappings ── */}
        {pendingLoaded && pendingMappings.length > 0 && (
          <div className="bg-[var(--surface)] border border-[#7f4c00] rounded-[10px] p-[18px] mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[13px] font-semibold text-[var(--text)] mb-[2px]">
                  Pending Name Mappings
                  <span className="ml-2 px-2 py-[2px] rounded bg-[#7f4c00] text-[#fbbf24] text-[11px] font-bold">{pendingMappings.length}</span>
                </div>
                <div className="text-[12px] text-[var(--text-dim)]">
                  Hubstaff names that couldn't be matched — confirm or dismiss each one.
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {pendingMappings.map(mapping => {
                const isActing     = mappingActing === mapping.hubstaffName;
                const isDismissing = mappingActing === mapping.hubstaffName + '_d';
                const selected     = mappingSelected[mapping.hubstaffName];
                const searchOpen   = activeSearchHub === mapping.hubstaffName;
                const confirmId    = selected?.id ?? mapping.suggestedMemberId;
                const confirmName  = selected?.name ?? mapping.suggestedMemberName;

                return (
                  <div key={mapping.hubstaffName} className="border border-[var(--border)] rounded-[8px] p-[14px] bg-[var(--surface-2)]">
                    <div className="flex items-start gap-3 flex-wrap">

                      {/* Left info */}
                      <div className="flex flex-col gap-[5px] flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-bold text-[var(--text)]">{mapping.hubstaffName}</span>
                          {mapping.autoApplied && (
                            <span className="text-[10px] px-[7px] py-[2px] rounded bg-[var(--accent)] text-white font-semibold tracking-wide">AUTO-APPLIED</span>
                          )}
                        </div>

                        {/* Suggestion row */}
                        {!selected && mapping.suggestedMemberName && (
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-[var(--text-dim)]">→</span>
                            <span style={{ color: scoreColor(mapping.score) }} className="font-semibold">{mapping.suggestedMemberName}</span>
                            <span className="text-[11px] text-[var(--text-faint)]">({scoreLabel(mapping.score)})</span>
                          </div>
                        )}
                        {!selected && !mapping.suggestedMemberName && (
                          <div className="text-[12px] text-[var(--text-faint)]">No automatic suggestion — search below</div>
                        )}

                        {/* Selected override */}
                        {selected && (
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-[var(--text-dim)]">→</span>
                            <span className="text-[#4ade80] font-semibold">{selected.name}</span>
                            <button
                              className="text-[11px] text-[var(--text-faint)] underline cursor-pointer"
                              onClick={() => setMappingSelected(prev => { const n = { ...prev }; delete n[mapping.hubstaffName]; return n; })}
                            >
                              change
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {confirmId && (
                          <button
                            onClick={() => handleConfirmMapping(mapping.hubstaffName, confirmId)}
                            disabled={isActing}
                            className={`px-3 py-[6px] rounded-[6px] text-[12px] font-semibold bg-[var(--accent)] text-white border-none inline-flex items-center gap-1.5 ${isActing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {isActing && <span className="spinner" style={{ width: 11, height: 11 }} />}
                            {isActing ? 'Saving…' : 'Confirm'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (searchOpen) { setActiveSearchHub(null); setMappingQuery(''); setMappingResults([]); }
                            else { setActiveSearchHub(mapping.hubstaffName); setMappingQuery(''); setMappingResults([]); }
                          }}
                          className="px-3 py-[6px] rounded-[6px] text-[12px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] cursor-pointer"
                        >
                          {searchOpen ? 'Cancel' : (confirmId ? 'Change' : 'Search')}
                        </button>
                        <button
                          onClick={() => handleDismissMapping(mapping.hubstaffName)}
                          disabled={isDismissing}
                          className={`px-3 py-[6px] rounded-[6px] text-[12px] text-[var(--text-faint)] bg-transparent border border-[var(--border)] ${isDismissing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {isDismissing ? '…' : 'Dismiss'}
                        </button>
                      </div>
                    </div>

                    {/* Inline search */}
                    {searchOpen && (
                      <div className="mt-3 relative" ref={mappingSearchRef}>
                        <input
                          type="text"
                          value={mappingQuery}
                          onChange={e => setMappingQuery(e.target.value)}
                          placeholder="Search by name or email (min 4 chars)…"
                          className="pl-3 w-full"
                          autoFocus
                        />
                        {(mappingSearching || mappingResults.length > 0) && (
                          <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg z-[200] shadow-[0_8px_24px_rgba(0,0,0,.45)] max-h-[200px] overflow-y-auto">
                            {mappingSearching && (
                              <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-[var(--text-dim)]">
                                <span className="spinner" style={{ width: 13, height: 13, margin: 0 }} />
                                Searching…
                              </div>
                            )}
                            {!mappingSearching && mappingResults.map(expert => (
                              <div
                                key={expert.id}
                                onClick={() => {
                                  setMappingSelected(prev => ({ ...prev, [mapping.hubstaffName]: expert }));
                                  setActiveSearchHub(null);
                                  setMappingQuery('');
                                  setMappingResults([]);
                                }}
                                className="flex flex-col gap-[3px] px-[14px] py-[10px] cursor-pointer border-b border-[var(--border-soft)] hover:bg-[var(--row-hover)]"
                              >
                                <span className="font-semibold text-[13px] text-[var(--text)]">{expert.name}</span>
                                <span className="text-[11px] text-[var(--text-dim)]">
                                  {[expert.personalEmail, expert.micro1Email].filter(Boolean).join(' · ') || 'No emails'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Search Expert ── */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] p-[18px] mb-6">
          <div className="text-[13px] font-semibold text-[var(--text)] mb-1">Search Expert</div>
          <div className="text-[12px] text-[var(--text-dim)] mb-3">
            Find an expert by name, personal email, or micro1 email to view and edit their details.
          </div>

          <div ref={searchRef} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, personal email or micro1 email (min 4 chars)…"
              className="pl-3 w-full"
            />

            {dropdownVisible && (
              <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg z-[200] shadow-[0_8px_24px_rgba(0,0,0,.45)] max-h-[300px] overflow-y-auto">
                {searchLoading && (
                  <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-[var(--text-dim)]">
                    <span className="spinner" style={{ width: 13, height: 13, margin: 0 }} />
                    Searching…
                  </div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="px-4 py-3 text-[13px] text-[var(--text-dim)]">No experts found</div>
                )}
                {!searchLoading && searchResults.map(expert => (
                  <div
                    key={expert.id}
                    onMouseEnter={() => setHoveredId(expert.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openEdit(expert)}
                    className={`flex justify-between items-center gap-3 px-[14px] py-[10px] cursor-pointer border-b border-[var(--border-soft)] transition-colors ${
                      hoveredId === expert.id ? 'bg-[var(--row-hover)]' : 'bg-transparent'
                    }`}
                  >
                    <div className="flex flex-col gap-[3px] min-w-0">
                      <span className="font-semibold text-[13px] text-[var(--text)]">{expert.name}</span>
                      <span className="text-[11px] text-[var(--text-dim)] overflow-hidden text-ellipsis whitespace-nowrap">
                        {[expert.personalEmail, expert.micro1Email].filter(Boolean).join(' · ') || 'No emails set'}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--accent)] font-semibold shrink-0">Edit →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── CSV Upload ── */}
        <div className="inv-page-header">
          <h2 className="inv-page-title">Upload Expert CSV</h2>
          <div className="flex items-center gap-2.5">
            {rows.length > 0 && !result && (
              <span className="result-count">{rows.length} row{rows.length !== 1 ? 's' : ''} parsed</span>
            )}
            <Button
              variant="secondary"
              onClick={handleSync}
              disabled={syncing}
              className={`gap-[7px] px-4 py-[7px] text-[13px] ${syncing ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {syncing
                ? <><span className="spinner" style={{ width: 11, height: 11 }} />Fetching…</>
                : <><img src="/icons8-hubstaff-240.png" width="15" height="15" alt="" style={{ borderRadius: 3 }} />Fetch Experts from Hubstaff</>
              }
            </Button>
          </div>
        </div>

        {syncResult && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-[10px] mb-4 bg-[#0d2318] border border-[#166534] text-[#4ade80] text-[13px] font-semibold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {syncResult.inserted} new expert{syncResult.inserted !== 1 ? 's' : ''} added to DB
            <span className="text-[var(--text-dim)] font-normal">
              ({syncResult.total} fetched from Hubstaff)
            </span>
            <Button variant="secondary" className="ml-auto text-[12px] px-2.5 py-1" onClick={() => setSyncResult(null)}>✕</Button>
          </div>
        )}
        {syncError && (
          <div className="modal-error show mb-4">{syncError}</div>
        )}

        <p className="text-[13px] text-[var(--text-dim)] mb-5 leading-relaxed">
          Upload a CSV with columns: <strong className="text-[var(--text)]">Member Name</strong>,{' '}
          <strong className="text-[var(--text)]">Personal Email</strong>,{' '}
          <strong className="text-[var(--text)]">Micro1 Email</strong>,{' '}
          <strong className="text-[var(--text)]">HDM</strong>,{' '}
          <strong className="text-[var(--text)]">Team</strong> (optional).
          Experts are matched by name (case-insensitive). Unmatched names are listed at the end.
        </p>

        {!result && (
          <div className="flex items-center gap-3 mb-5">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-[13px] font-semibold">
              <img src="/icons8-excel-240.png" width="16" height="16" alt="" style={{ borderRadius: 3 }} />
              Choose CSV
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
            {fileName && <span className="text-[13px] text-[var(--text-dim)]">{fileName}</span>}
            {rows.length > 0 && (
              <>
                <div className="flex-1" />
                <Button variant="secondary" onClick={handleReset} className="text-[13px]">Clear</Button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className={`px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--accent)] text-white border-none cursor-pointer ${uploading ? 'opacity-60' : ''}`}
                >
                  {uploading ? 'Updating…' : `Update ${rows.length} expert${rows.length !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        )}

        {parseError && <div className="modal-error show mb-4">{parseError}</div>}
        {apiError   && <div className="modal-error show mb-4">{apiError}</div>}

        {result && (
          <div className="mb-6 flex flex-col gap-3">
            <div className="flex items-center gap-3 px-[18px] py-[14px] rounded-[10px] bg-[#0d2318] border border-[#166534] text-[#4ade80] text-[14px] font-semibold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {result.updated} expert{result.updated !== 1 ? 's' : ''} updated successfully
              <div className="flex-1" />
              <Button variant="secondary" onClick={handleReset} className="text-[12px]">Upload another</Button>
            </div>

            {result.fuzzyMatched?.length > 0 && (
              <div className="px-[18px] py-[14px] rounded-[10px] bg-[#1a1200] border border-[#7f4c00]">
                <div className="text-[#fbbf24] text-[13px] font-semibold mb-2.5">
                  {result.fuzzyMatched.length} name{result.fuzzyMatched.length !== 1 ? 's' : ''} matched by similarity — verify these
                </div>
                <div className="flex flex-col gap-[6px]">
                  {result.fuzzyMatched.map(({ csvName, matchedTo }) => (
                    <div key={csvName} className="flex items-center gap-2 text-[12px]">
                      <span className="px-2.5 py-[3px] rounded-md bg-[#2d1f00] border border-[#7f4c00] text-[#fcd34d]">{csvName}</span>
                      <span className="text-[var(--text-dim)]">→</span>
                      <span className="px-2.5 py-[3px] rounded-md bg-[#2d1f00] border border-[#166534] text-[#4ade80]">{matchedTo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.notFound.length > 0 && (
              <div className="px-[18px] py-[14px] rounded-[10px] bg-[#1a0f0f] border border-[#7f1d1d]">
                <div className="text-[#f87171] text-[13px] font-semibold mb-2.5">
                  {result.notFound.length} name{result.notFound.length !== 1 ? 's' : ''} not found in database
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.notFound.map(name => (
                    <span key={name} className="px-2.5 py-[3px] rounded-md bg-[#2d1515] border border-[#7f1d1d] text-[#fca5a5] text-[12px]">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && !result && (
          <MemberTable rows={rows} />
        )}
        {/* ── QC Tracking Upload ── */}
        <div className="mt-10">
          <div className="inv-page-header">
            <h2 className="inv-page-title">Upload QC Tracking CSV</h2>
            {qcRows.length > 0 && !qcResult && (
              <span className="result-count">{qcRows.length} task row{qcRows.length !== 1 ? 's' : ''} parsed</span>
            )}
          </div>
          <p className="text-[13px] text-[var(--text-dim)] mb-5 leading-relaxed">
            Upload the daily QC Tracking sheet to sync task data into expert reports.
            Required columns: <strong className="text-[var(--text)]">Date</strong>,{' '}
            <strong className="text-[var(--text)]">Expert Email</strong>,{' '}
            <strong className="text-[var(--text)]">Feather Link</strong>,{' '}
            <strong className="text-[var(--text)]">Recording Length</strong>,{' '}
            <strong className="text-[var(--text)]">App</strong>.
          </p>

          {!qcResult && (
            <div className="flex items-center gap-3 mb-5">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-[13px] font-semibold">
                <img src="/icons8-google-240.png" width="16" height="16" alt="" style={{ borderRadius: 3 }} />
                Choose QC CSV
                <input ref={qcFileRef} type="file" accept=".csv,text/csv" onChange={handleQcFile} className="hidden" />
              </label>
              {qcFileName && <span className="text-[13px] text-[var(--text-dim)]">{qcFileName}</span>}
              {qcRows.length > 0 && (
                <>
                  <div className="flex-1" />
                  <button
                    onClick={handleQcUpload}
                    disabled={qcUploading}
                    className={`px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--accent)] text-white border-none cursor-pointer inline-flex items-center gap-2 ${qcUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {qcUploading
                      ? <><span className="spinner" style={{ width: 13, height: 13 }} />Updating…</>
                      : `Update ${qcRows.length} task row${qcRows.length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          )}

          {qcParseError && <div className="modal-error show mb-4">{qcParseError}</div>}
          {qcApiError   && <div className="modal-error show mb-4">{qcApiError}</div>}

          {qcResult && (
            <div className="mb-6">
              <div className="flex items-center gap-3 px-[18px] py-[14px] rounded-[10px] bg-[#0d2318] border border-[#166534] text-[#4ade80] text-[14px] font-semibold mb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {qcResult.updated} expert report{qcResult.updated !== 1 ? 's' : ''} updated with task data
                <div className="flex-1" />
                <Button variant="secondary" onClick={() => setQcResult(null)} className="text-[12px]">
                  Upload another
                </Button>
              </div>

              {qcResult.notFound.length > 0 && (
                <div className="px-[18px] py-[14px] rounded-[10px] bg-[#1a0f0f] border border-[#7f1d1d]">
                  <div className="text-[#f87171] text-[13px] font-semibold mb-2.5">
                    {qcResult.notFound.length} expert{qcResult.notFound.length !== 1 ? 's' : ''} not found in reports
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {qcResult.notFound.map(name => (
                      <span key={name} className="px-2.5 py-[3px] rounded-md bg-[#2d1515] border border-[#7f1d1d] text-[#fca5a5] text-[12px]">
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
                <span className="inv-info-value font-bold">{editExpert.name}</span>
              </div>
            </div>

            {saveSuccess && (
              <div className="flex items-center gap-2 text-[13px] text-[#4ade80] font-semibold">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Expert updated successfully
              </div>
            )}

            {saveError && <div className="modal-error show">{saveError}</div>}

            {!saveSuccess && (
              <>
                <div className="flex flex-col gap-3.5">
                  {EDIT_FIELDS.map(({ key, label, placeholder }) => (
                    <div className="modal-field" key={key}>
                      <label>{label}</label>
                      <input
                        type="text"
                        value={editFields[key]}
                        onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="pl-3"
                        disabled={saving}
                      />
                    </div>
                  ))}
                </div>

                <div className="modal-actions">
                  <Button variant="secondary" onClick={closeModal} disabled={saving}>
                    Cancel
                  </Button>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={saving}
                    className={`px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--accent)] text-white border-none ${saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
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
            <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">
              Save changes to{' '}
              <strong className="text-[var(--text)]">{editExpert.name}</strong>?
              This will overwrite their current details in the database.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowConfirm(false)} disabled={saving}>
                Cancel
              </Button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--accent)] text-white border-none inline-flex items-center gap-2 ${saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
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
