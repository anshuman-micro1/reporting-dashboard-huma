import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { PendingMapping } from '@/lib/models/PendingMapping';
import { Member } from '@/lib/models/Member';

export async function GET() {
  await dbConnect();
  const mappings = await PendingMapping.find().sort({ lastSeen: -1 }).lean();
  return NextResponse.json(mappings);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { hubstaffName, memberId } = await req.json() as { hubstaffName?: string; memberId?: string };
  if (!hubstaffName?.trim() || !memberId?.trim()) {
    return NextResponse.json({ error: 'hubstaffName and memberId are required' }, { status: 400 });
  }

  await dbConnect();
  const updated = await Member.findByIdAndUpdate(
    new mongoose.Types.ObjectId(memberId),
    { $set: { hubstaffName: hubstaffName.trim(), updatedAt: new Date() } },
    { new: true },
  );
  if (!updated) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  await PendingMapping.deleteOne({ hubstaffName: hubstaffName.trim() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const hubstaffName = req.nextUrl.searchParams.get('hubstaffName');
  if (!hubstaffName) return NextResponse.json({ error: 'hubstaffName is required' }, { status: 400 });

  await dbConnect();
  await PendingMapping.deleteOne({ hubstaffName });
  return NextResponse.json({ ok: true });
}
