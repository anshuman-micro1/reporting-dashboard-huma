import { NextRequest, NextResponse } from 'next/server';
import { runReport } from '@/lib/hubstaff';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { dateStart, dateEnd } = await req.json().catch(() => ({})) as { dateStart?: string; dateEnd?: string };

  try {
    await runReport(dateStart, dateEnd);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
