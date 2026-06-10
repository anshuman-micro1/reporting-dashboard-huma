import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';

export async function GET() {
  try {
    await dbConnect();

    const [noHubstaff, noHDMDocs, linkedDocs] = await Promise.all([
      Member.find({
        $or: [{ hubstaffId: null }, { hubstaffId: { $exists: false } }],
      }).select('hubstaffName personalEmail micro1Email hdm app status').lean(),

      Member.find({
        $or: [{ hdm: null }, { hdm: '' }, { hdm: { $exists: false } }],
        $and: [{ $or: [{ micro1Email: { $ne: null } }, { personalEmail: { $ne: null } }] }],
      }).select('hubstaffName personalEmail micro1Email hdm app status').lean(),

      Member.find({ hubstaffId: { $ne: null } }).select('hubstaffId').lean(),
    ]);

    const hdmDistinct = await Member.distinct('hdm', { hdm: { $ne: null } });

    const mapMember = (m: Record<string, unknown> & { _id: unknown }) => ({
      id:            (m._id as mongoose.Types.ObjectId).toString(),
      name:          m.hubstaffName as string,
      personalEmail: (m.personalEmail as string | null) ?? null,
      micro1Email:   (m.micro1Email as string | null) ?? null,
      hdm:           (m.hdm as string | null) ?? null,
      app:           (m.app as string | null) ?? null,
      status:        (m.status as string | null) ?? null,
    });

    return NextResponse.json({
      noHubstaff:        noHubstaff.map(m => mapMember(m as Record<string, unknown> & { _id: unknown })),
      noHDM:             noHDMDocs.map(m => mapMember(m as Record<string, unknown> & { _id: unknown })),
      linkedHubstaffIds: linkedDocs.map(m => m.hubstaffId as number),
      hdmList:           (hdmDistinct as (string | null)[]).filter(Boolean).sort() as string[],
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
