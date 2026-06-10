import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { QCSubmission } from '@/lib/models/QCSubmission';

function countValues(arr: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of arr) {
    if (v == null || String(v).trim() === '') continue;
    const key = String(v).trim();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export async function GET() {
  try {
    await dbConnect();

    const grouped = await QCSubmission.aggregate([
      {
        $group: {
          _id:           { $ifNull: ['$expertEmail', '$expertName'] },
          expertName:    { $first: '$expertName' },
          expertEmail:   { $first: '$expertEmail' },
          personalEmail: { $first: '$personalEmail' },
          assignedHDM:   { $first: '$assignedHDM' },
          taskCount:     { $sum: 1 },
          reviewedCount: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$tagStatus', null] }, { $ne: ['$tagStatus', ''] }] },
                1, 0,
              ],
            },
          },
          latestDate:    { $max: '$date' },
          earliestDate:  { $min: '$date' },
          tagStatuses:   { $push: '$tagStatus' },
          appValues:     { $push: '$app' },
          reviewerNames: { $push: '$reviewerName' },
        },
      },
      { $sort: { taskCount: -1 } },
    ]);

    const results = grouped.map(r => {
      const tagStatusBreakdown = countValues(r.tagStatuses);
      const appBreakdown       = countValues(r.appValues);
      const reviewerBreakdown  = countValues(r.reviewerNames);

      const passCount = Object.entries(tagStatusBreakdown)
        .filter(([k]) => /pass|ok|approv/i.test(k))
        .reduce((s, [, v]) => s + v, 0);
      const passRate = r.reviewedCount > 0
        ? Math.round((passCount / r.reviewedCount) * 100)
        : null;

      return {
        _id:               r._id,
        expertName:        r.expertName,
        expertEmail:       r.expertEmail,
        personalEmail:     r.personalEmail,
        assignedHDM:       r.assignedHDM,
        taskCount:         r.taskCount,
        reviewedCount:     r.reviewedCount,
        pendingCount:      r.taskCount - r.reviewedCount,
        passRate,
        apps:              Object.keys(appBreakdown).sort(),
        latestDate:        r.latestDate,
        earliestDate:      r.earliestDate,
        tagStatusBreakdown,
        appBreakdown,
        reviewerBreakdown,
      };
    });

    return NextResponse.json(results);
  } catch (err) {
    console.error('[/api/qc/experts] GET', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
