import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';
import * as XLSX from 'xlsx';

const ALIASES: Record<string, string[]> = {
  hubstaffName:                 ['Name✏️', 'Name', 'name', 'Expert Name', 'expert name'],
  personalEmail:                ['Personal Email✏️', 'Personal Email', 'personalEmail', 'personal email'],
  micro1Email:                  ['Expert Email✏️', 'Expert Email', 'expertEmail', 'expert email'],
  app:                          ['App🤖', 'App', 'app'],
  hdm:                          ['HDM🤖', 'HDM', 'hdm'],
  status:                       ['Status✏️', 'Status', 'status'],
  pod:                          ['Pod✏️', 'Pod', 'pod'],
  addedToPodChannel:            ['Added to POD Channel✏️', 'Added to POD Channel'],
  setupComplete:                ['Setup Complete✏️', 'Setup Complete'],
  removedFromOnboardingChannel: ['❌Removed From Onboarding Channel', 'Removed From Onboarding Channel'],
};

function pick(row: Record<string, any>, field: string): string | null {
  const aliases = ALIASES[field] ?? [field];
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = v;
  for (const alias of aliases) {
    const v = lower[alias.trim().toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb  = XLSX.read(buf, { type: 'buffer' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

    await dbConnect();

    const ops = rows
      .map(row => {
        const hubstaffName = pick(row, 'hubstaffName');
        if (!hubstaffName) return null;

        const micro1Email  = pick(row, 'micro1Email');
        const personalEmail = pick(row, 'personalEmail');

        const update: Record<string, any> = { updatedAt: new Date() };
        if (micro1Email)   update.micro1Email   = micro1Email;
        if (personalEmail) update.personalEmail = personalEmail;
        const hdm = pick(row, 'hdm');   if (hdm)   update.hdm   = hdm;
        const pod = pick(row, 'pod');   if (pod)   update.pod   = pod;
        const app = pick(row, 'app');   if (app)   update.app   = app;
        const status = pick(row, 'status'); if (status) update.status = status;
        const apc  = pick(row, 'addedToPodChannel');            if (apc)  update.addedToPodChannel = apc;
        const sc   = pick(row, 'setupComplete');                if (sc)   update.setupComplete = sc;
        const rfoc = pick(row, 'removedFromOnboardingChannel'); if (rfoc) update.removedFromOnboardingChannel = rfoc;

        // Match priority: micro1Email > personalEmail > hubstaffName
        const filter = micro1Email
          ? { micro1Email }
          : personalEmail
            ? { personalEmail }
            : { hubstaffName };

        return {
          updateOne: {
            filter,
            update: { $set: update, $setOnInsert: { hubstaffName, createdAt: new Date() } },
            upsert: true,
          },
        };
      })
      .filter(Boolean) as object[];

    if (!ops.length) return NextResponse.json({ error: 'No valid rows' }, { status: 400 });

    const result = await Member.bulkWrite(ops as any, { ordered: false });
    return NextResponse.json({ ok: true, upserted: result.upsertedCount, modified: result.modifiedCount, total: rows.length });
  } catch (err) {
    console.error('[/api/expert-profiles/upload]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
