import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { QCSubmission } from '@/lib/models/QCSubmission';

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
    // Validate and normalize rows before building bulk ops.
    const invalidRows: Array<{ index: number; reason: string; row: Record<string, any> }> = [];
    const validDocs: any[] = [];

    function isEmail(s: any) {
      if (!s) return false;
      return /\S+@\S+\.\S+/.test(String(s));
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as Record<string, any>;
      const doc: any = {
        date: r.date || r.Date || r['Date'] || r['Date 🤖'] || r['date 🤖'] || r['Date\t'] || '',
        expertName: r.expertName || r['Expert Name'] || r['Expert Name🤖'] || r['expert_name'] || r['Expert Name '] || '',
        personalEmail: r.personalEmail || r['Personal Email'] || r['Personal Email🤖'] || r['personal_email'] || null,
        expertEmail: r.expertEmail || r['Expert Email'] || r['Expert Email 🤖'] || r['expert_email'] || null,
        assignedHDM: r.assignedHDM || r['Assigned HDM'] || r['Assigned HDM🤖'] || r['assigned_hdm'] || null,
        featherLink: r.featherLink || r['Feather Link'] || r['Feather Link🤖'] || r['feather_link'] || null,
        recordingLength: r.recordingLength || r['Recording Length'] || r['Recording Length🤖'] || r['recording_length'] || null,
        app: r.app || r['App'] || r['App🤖'] || null,
        reviewerName: r.reviewerName || r['Reviewer Name'] || r['Reviewer Name✏️ <-DO NOT edit A-H!!!'] || null,
        tagStatus: r.tagStatus || r['Tag Status'] || null,
        notes: r.notes || r['Complete Description'] || null,
        raw: r,
        updatedAt: new Date(),
      };

      // Basic validation: require date and either expertEmail or expertName
      if (!doc.date) {
        invalidRows.push({ index: i, reason: 'missing date', row: r });
        continue;
      }

      const parsed = new Date(String(doc.date));
      if (isNaN(parsed.getTime())) {
        invalidRows.push({ index: i, reason: `invalid date: ${doc.date}`, row: r });
        continue;
      }
      // normalize to YYYY-MM-DD
      doc.date = parsed.toISOString().slice(0, 10);

      if (!doc.expertEmail && !doc.expertName) {
        invalidRows.push({ index: i, reason: 'missing expertEmail and expertName', row: r });
        continue;
      }

      if (doc.expertEmail && !isEmail(doc.expertEmail)) {
        invalidRows.push({ index: i, reason: `invalid expertEmail: ${doc.expertEmail}`, row: r });
        continue;
      }

      validDocs.push(doc);
    }

    const ops = validDocs.map((doc: any) => ({
      updateOne: {
        filter: { expertEmail: doc.expertEmail || doc.expertName, date: doc.date },
        update: { $set: doc, $setOnInsert: { createdAt: new Date() } },
        upsert: true,
      },
    }));

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
