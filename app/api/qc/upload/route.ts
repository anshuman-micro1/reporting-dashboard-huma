import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { read, utils } from 'xlsx';
import { dbConnect } from '@/lib/db';
import { QCSubmission } from '@/lib/models/QCSubmission';
import { buildQCUpsertOps, normalizeQCSourceRows } from '@/lib/qc-import';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ ok: false, error: 'Excel file is required' }, { status: 400 });
    }

    const rows = await readRowsFromFile(file);
    const { docs, invalidRows } = normalizeQCSourceRows(rows);

    await dbConnect();
    const ops = buildQCUpsertOps(docs);

    if (ops.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, rejected: invalidRows.length, errors: invalidRows.slice(0, 10) });
    }

    const result = await QCSubmission.bulkWrite(ops, { ordered: false });
    return NextResponse.json({
      ok: true,
      result: { upserted: result.upsertedCount ?? 0, modified: result.modifiedCount ?? 0 },
      rejected: invalidRows.length,
      errors: invalidRows.slice(0, 20),
    });
  } catch (err: unknown) {
    console.error('[/api/qc/upload] POST', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

async function readRowsFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();

  let workbook;
  if (fileName.endsWith('.csv')) {
    workbook = read(buffer.toString('utf8'), { type: 'string', cellDates: true });
  } else {
    workbook = read(buffer, { type: 'buffer', cellDates: true });
  }

  const sheetName = formDataSheetName(fileName, workbook.SheetNames[0]);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  return utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: '',
    raw: false,
  });
}

function formDataSheetName(_fileName: string, fallback: string) {
  return fallback;
}
