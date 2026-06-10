import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';
import { QCSubmission } from '@/lib/models/QCSubmission';

export async function GET(req: NextRequest) {
  const thresholdDays = parseInt(req.nextUrl.searchParams.get('days') || '30');

  try {
    await dbConnect();

    // Latest QC submission date per expertEmail (micro1Email)
    const qcAgg = await QCSubmission.aggregate([
      { $match: { expertEmail: { $ne: null } } },
      { $group: { _id: '$expertEmail', lastQC: { $max: '$date' } } },
    ]);
    const lastQCMap: Record<string, string> = {};
    for (const r of qcAgg) lastQCMap[r._id] = r.lastQC;

    const members = await Member.find({}).lean();

    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - thresholdDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    type InactiveExpert = {
      name: string;
      personalEmail: string | null;
      expertEmail: string | null;
      app: string | null;
      status: string | null;
      pod: string | null;
      hdm: string | null;
      lastQC: string | null;
      daysSinceQC: number | null;
      reason: string;
    };

    const inactive: InactiveExpert[] = [];

    for (const m of members) {
      const statusLower = (m.status || '').trim().toLowerCase();
      const isStatusInactive = statusLower !== '' && statusLower !== 'active';
      const lastQC = m.micro1Email ? (lastQCMap[m.micro1Email] ?? null) : null;
      const daysSinceQC = lastQC
        ? Math.floor((today.getTime() - new Date(lastQC + 'T00:00:00').getTime()) / 86400000)
        : null;
      const isQCInactive = !lastQC || lastQC < cutoffStr;

      if (!isStatusInactive && !isQCInactive) continue;

      const reasons: string[] = [];
      if (isStatusInactive) reasons.push(`Status: ${m.status}`);
      if (isQCInactive)     reasons.push(lastQC ? `No QC in ${daysSinceQC}d` : 'No QC submissions');

      inactive.push({
        name:          m.hubstaffName,
        personalEmail: m.personalEmail ?? null,
        expertEmail:   m.micro1Email   ?? null,
        app:           m.app           ?? null,
        status:        m.status        ?? null,
        pod:           m.pod           ?? null,
        hdm:           m.hdm           ?? null,
        lastQC,
        daysSinceQC,
        reason: reasons.join(' · '),
      });
    }

    // Group by HDM
    const byHDM: Record<string, { hdm: string; experts: InactiveExpert[] }> = {};
    for (const e of inactive) {
      const key = e.hdm || 'Unassigned';
      if (!byHDM[key]) byHDM[key] = { hdm: key, experts: [] };
      byHDM[key].experts.push(e);
    }

    const groups = Object.values(byHDM)
      .sort((a, b) => b.experts.length - a.experts.length)
      .map(g => ({
        ...g,
        experts: g.experts.sort((a, b) => (b.daysSinceQC ?? 9999) - (a.daysSinceQC ?? 9999)),
      }));

    return NextResponse.json({ groups, totalInactive: inactive.length, thresholdDays });
  } catch (err) {
    console.error('[/api/expert-profiles/inactive]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
