import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { QCSubmission } from '@/lib/models/QCSubmission';
import { buildQCUpsertOps, normalizeQCSourceRows } from '@/lib/qc-import';

// GET: list recent QC submissions (query params: search, from, to, limit)
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const search = url.searchParams.get('search') || '';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = parseInt(url.searchParams.get('limit') || '200');
  try {
    await dbConnect();
    const filter: any = {};
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [ { expertName: re }, { personalEmail: re }, { expertEmail: re }, { assignedHDM: re } ];
    }
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }
    const docs = await QCSubmission.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
    return NextResponse.json(docs);
  } catch (err: unknown) {
    console.error('[/api/qc] GET', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST: two modes
// 1) body contains { rows: [...] } (recommended — Apps Script push)
// 2) body empty -> attempt server-side fetch if GOOGLE_SHEETS_CSV_URL is set
export async function POST(req: NextRequest) {
  try {
    // API key validation (optional): if QC_API_KEY is set, require matching header
    const providedKey = req.headers.get('x-qc-api-key') || req.headers.get('X-QC-Api-Key');
    const expectedKey = process.env.QC_API_KEY;
    if (expectedKey && providedKey !== expectedKey) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    let rows: any[] = [];
    if (body && Array.isArray(body.rows)) {
      rows = body.rows;
    } else {
      // server-side fetch using CSV export URL (sheet must be shared)
      const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL;
      if (!csvUrl) return NextResponse.json({ ok: false, error: 'No rows provided and GOOGLE_SHEETS_CSV_URL not set' }, { status: 400 });
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error(`Failed to fetch sheet: HTTP ${res.status}`);
      const text = await res.text();
      rows = parseCsvToObjects(text);
    }

    await dbConnect();
    const { docs, invalidRows } = normalizeQCSourceRows(rows);
    const ops = buildQCUpsertOps(docs);

    if (ops.length === 0) return NextResponse.json({ ok: true, inserted: 0, rejected: invalidRows.length, errors: invalidRows.slice(0, 10) });
    const result = await QCSubmission.bulkWrite(ops, { ordered: false });
    const upserted = result.upsertedCount ?? 0;
    const modified = result.modifiedCount ?? 0;
    return NextResponse.json({ ok: true, result: { upserted, modified }, rejected: invalidRows.length, errors: invalidRows.slice(0, 20) });
  } catch (err: unknown) {
    console.error('[/api/qc] POST', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

function parseCsvToObjects(csvText: string): Record<string, string>[] {
  // Simple CSV parser — assumes first row headers
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = tokenise(lines[0]);
  return lines.slice(1).map(line => {
    const vals = tokenise(line);
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = vals[i] ?? '';
    return obj;
  });
}

function tokenise(line: string): string[] {
  const fields: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}
