import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search');
  try {
    await dbConnect();

    let matchStage: object = {};
    if (search?.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      matchStage = {
        $or: [
          { hubstaffName:  regex },
          { personalEmail: regex },
          { micro1Email:   regex },
        ],
      };
    }

    const docs = await Member.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from:         'reports',
          localField:   'hubstaffName',
          foreignField: 'memberName',
          as:           '_r',
        },
      },
      { $addFields: { _report: { $arrayElemAt: ['$_r', 0] } } },
      {
        $lookup: {
          from: 'expert_final_tasks',
          let:  { me: '$micro1Email', pe: '$personalEmail' },
          pipeline: [
            { $match: { $expr: { $or: [
              { $and: [{ $ne: ['$$me', null] }, { $eq: ['$expertEmail',   '$$me'] }] },
              { $and: [{ $ne: ['$$me', null] }, { $eq: ['$personalEmail', '$$me'] }] },
              { $and: [{ $ne: ['$$pe', null] }, { $eq: ['$expertEmail',   '$$pe'] }] },
              { $and: [{ $ne: ['$$pe', null] }, { $eq: ['$personalEmail', '$$pe'] }] },
            ]}}},
            { $project: { _id: 0, totalFinalTaskCount: 1 } },
          ],
          as: '_eft',
        },
      },
      {
        $project: {
          _id:                 0,
          memberName:          '$hubstaffName',
          personalEmail:       1,
          micro1Email:         1,
          hdm:                 1,
          team:                1,
          organization:        { $ifNull: ['$_report.organization', ''] },
          timezone:            { $ifNull: ['$_report.timezone',     ''] },
          activity:            { $ifNull: ['$_report.activity',     ''] },
          dates:               { $ifNull: ['$_report.dates',        {}] },
          allTasks:            { $ifNull: ['$_report.allTasks',     []] },
          totalFinalTaskCount: { $ifNull: [{ $arrayElemAt: ['$_eft.totalFinalTaskCount', 0] }, null] },
        },
      },
      { $sort: { memberName: 1 } },
    ]);

    return NextResponse.json(docs);
  } catch (err: unknown) {
    console.error('[/api/reports]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
