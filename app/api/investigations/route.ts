import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Investigation } from '@/lib/models/Investigation';

export async function GET() {
  try {
    await dbConnect();
    const docs = await Investigation.find({}).sort({ investigationDate: -1 }).lean();
    return NextResponse.json(
      docs.map(({ _id, ...rest }) => ({ id: (_id as mongoose.Types.ObjectId).toString(), ...rest })),
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { name, personalEmail, micro1Email, notes, investigationDate } = await req.json();
  if (!name || !notes) {
    return NextResponse.json({ error: 'name and notes are required' }, { status: 400 });
  }
  try {
    await dbConnect();
    await Investigation.create({
      name,
      personalEmail: personalEmail ?? null,
      micro1Email:   micro1Email   ?? null,
      notes,
      status:             'open',
      investigationDate:  investigationDate ?? new Date().toISOString().slice(0, 10),
      createdAt:          new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  if (!id || !['open', 'closed'].includes(status)) {
    return NextResponse.json({ error: 'id and valid status required' }, { status: 400 });
  }
  try {
    await dbConnect();
    await Investigation.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { status } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
