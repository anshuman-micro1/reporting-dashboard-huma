import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search');
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB!);

    let query: object = {};
    if (search?.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query = { $or: [{ hubstaffName: regex }, { personalEmail: regex }, { micro1Email: regex }] };
    }

    // Use members as the base so all experts appear, even those with no tracked time.
    // Left-join reports to pull in dates/activity for those who do have data.
    const docs = await db.collection('members').aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'reports',
          localField: 'hubstaffName',
          foreignField: 'memberName',
          as: '_r',
        },
      },
      {
        $addFields: { _report: { $arrayElemAt: ['$_r', 0] } },
      },
      {
        $project: {
          _id: 0,
          memberName:    '$hubstaffName',
          personalEmail: 1,
          micro1Email:   1,
          hdm:           1,
          team:          1,
          organization:  { $ifNull: ['$_report.organization', ''] },
          timezone:      { $ifNull: ['$_report.timezone',     ''] },
          activity:      { $ifNull: ['$_report.activity',     ''] },
          dates:         { $ifNull: ['$_report.dates',        {}] },
        },
      },
      { $sort: { memberName: 1 } },
    ]).toArray();

    return NextResponse.json(docs);
  } catch (err: unknown) {
    console.error('[/api/reports]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}
