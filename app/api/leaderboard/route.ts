import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';

function fromSecs(s: number): string {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from');
  const to   = req.nextUrl.searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 });
  }

  try {
    await dbConnect();

    const docs = await Member.aggregate([
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
        $addFields: {
          totalSeconds: {
            $reduce: {
              input: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ['$_report.dates', {}] } },
                  cond: {
                    $and: [
                      { $gte: ['$$this.k', from] },
                      { $lte: ['$$this.k', to]   },
                    ],
                  },
                },
              },
              initialValue: 0,
              in: {
                $add: [
                  '$$value',
                  {
                    $let: {
                      vars: { parts: { $split: ['$$this.v', ':'] } },
                      in: {
                        $add: [
                          { $multiply: [{ $ifNull: [{ $toInt: { $arrayElemAt: ['$$parts', 0] } }, 0] }, 3600] },
                          { $multiply: [{ $ifNull: [{ $toInt: { $arrayElemAt: ['$$parts', 1] } }, 0] }, 60  ] },
                          { $ifNull: [{ $toInt: { $arrayElemAt: ['$$parts', 2] } }, 0] },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      { $match: { totalSeconds: { $gt: 0 } } },
      { $sort:  { totalSeconds: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id:         0,
          memberName:  '$hubstaffName',
          hdm:         1,
          totalSeconds: 1,
        },
      },
    ]);

    const result = docs.map((doc, i) => ({
      rank:           i + 1,
      memberName:     doc.memberName  as string,
      hdm:            (doc.hdm as string | null) ?? null,
      totalSeconds:   doc.totalSeconds as number,
      totalFormatted: fromSecs(doc.totalSeconds as number),
    }));

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[/api/leaderboard]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
