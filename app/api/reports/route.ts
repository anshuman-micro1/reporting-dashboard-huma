import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search');
  console.log('[/api/reports] MONGO_URI set:', !!process.env.MONGO_URI, '| MONGO_DB:', process.env.MONGO_DB);
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const collection = client.db(process.env.MONGO_DB!).collection('reports');
    let query: object = {};
    if (search?.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query = { $or: [{ memberName: regex }, { personalEmail: regex }, { micro1Email: regex }] };
    }
    const docs = await collection.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'members',
          localField: 'micro1Email',
          foreignField: 'micro1Email',
          as: '_m',
        },
      },
      {
        $addFields: {
          hdm:  { $ifNull: [{ $arrayElemAt: ['$_m.hdm',  0] }, null] },
          team: { $ifNull: [{ $arrayElemAt: ['$_m.team', 0] }, null] },
        },
      },
      { $project: { _id: 0, _m: 0 } },
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
