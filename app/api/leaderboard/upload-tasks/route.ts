import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { read, utils } from 'xlsx';
import { dbConnect } from '@/lib/db';
import { ExpertFinalTask } from '@/lib/models/ExpertFinalTask';

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
      return NextResponse.json({ ok: false, error: 'CSV file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const fileName = (file as File).name.toLowerCase();

    let workbook;
    if (fileName.endsWith('.csv')) {
      workbook = read(buffer.toString('utf8'), { type: 'string' });
    } else {
      workbook = read(buffer, { type: 'buffer' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return NextResponse.json({ ok: false, error: 'Empty workbook' }, { status: 400 });
    }

    const rows = utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    await dbConnect();

    const ops = [];
    let skipped = 0;

    for (const row of rows) {
      const email = String(
        row['Expert Email'] ?? row['expert_email'] ?? row['expertEmail'] ?? row['email'] ?? ''
      ).trim().toLowerCase();

      const personalEmailRaw = String(
        row['Personal Email'] ?? row['personal_email'] ?? row['personalEmail'] ?? ''
      ).trim().toLowerCase();
      const personalEmail = personalEmailRaw || null;

      const rawCount = row['Total Tasks'] ?? row['total_task'] ?? row['Total Task'] ?? row['totalTask'] ?? row['total_tasks'] ?? '';
      const count = parseInt(String(rawCount).trim(), 10);

      if (!email || isNaN(count)) { skipped++; continue; }

      ops.push({
        updateOne: {
          filter: { expertEmail: email },
          update: { $set: { totalFinalTaskCount: count, personalEmail, updatedAt: new Date() } },
          upsert: true,
        },
      });
    }

    if (ops.length === 0) {
      return NextResponse.json({ ok: true, upserted: 0, modified: 0, skipped });
    }

    const result = await ExpertFinalTask.bulkWrite(ops, { ordered: false });
    return NextResponse.json({
      ok: true,
      upserted: result.upsertedCount ?? 0,
      modified: result.modifiedCount ?? 0,
      skipped,
    });
  } catch (err: unknown) {
    console.error('[/api/leaderboard/upload-tasks] POST', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
