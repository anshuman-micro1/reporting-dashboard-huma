import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { QCSubmission } from '@/lib/models/QCSubmission';
import { Report } from '@/lib/models/Report';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'email param required' }, { status: 400 });
  try {
    await dbConnect();
    const [submissions, report] = await Promise.all([
      QCSubmission.find({ expertEmail: email }).sort({ date: -1 }).lean(),
      Report.findOne({ micro1Email: email }).lean(),
    ]);
    return NextResponse.json({ submissions, report: report ?? null });
  } catch (err) {
    console.error('[/api/qc/expert] GET', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
