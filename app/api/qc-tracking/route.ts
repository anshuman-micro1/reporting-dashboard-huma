import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Report } from '@/lib/models/Report';

interface QCTask {
  link: string;
  recordingLength: string;
  app: string;
}

interface ParsedQCRow {
  date: string;
  expertEmail: string;
  expertName: string;
  link: string;
  recordingLength: string;
  app: string;
}

export async function POST(req: NextRequest) {
  const { rows }: { rows: ParsedQCRow[] } = await req.json();
  if (!rows?.length) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  // Group by expert email
  const byExpert = new Map<string, ParsedQCRow[]>();
  for (const row of rows) {
    if (!row.expertEmail || !row.date || !row.link) continue;
    const key = row.expertEmail.toLowerCase();
    if (!byExpert.has(key)) byExpert.set(key, []);
    byExpert.get(key)!.push(row);
  }

  try {
    await dbConnect();
    let updated = 0;
    const notFound: string[] = [];

    for (const [email, expertRows] of byExpert) {
      const byDate = new Map<string, QCTask[]>();
      for (const row of expertRows) {
        if (!byDate.has(row.date)) byDate.set(row.date, []);
        byDate.get(row.date)!.push({ link: row.link, recordingLength: row.recordingLength, app: row.app });
      }

      const allTasks = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tasks]) => ({ date, tasks }));

      // Match by micro1Email first (indexed)
      const result = await Report.updateOne(
        { micro1Email: email },
        { $set: { allTasks } },
      );

      if (result.matchedCount === 0) {
        // Fallback: case-insensitive name match
        const name    = expertRows[0].expertName;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const result2 = await Report.updateOne(
          { memberName: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { $set: { allTasks, micro1Email: email } },
        );
        if (result2.matchedCount === 0) {
          notFound.push(name || email);
        } else {
          updated++;
        }
      } else {
        updated++;
      }
    }

    return NextResponse.json({ ok: true, updated, notFound });
  } catch (err: unknown) {
    console.error('[/api/qc-tracking]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
