import { NextRequest, NextResponse } from 'next/server';
import { clearCredentialsCache } from '@/lib/credentials-cache';
import { dbConnect } from '@/lib/db';
import { Settings } from '@/lib/models/Settings';

const SETTINGS_ID = 'hubstaff_credentials';

export async function GET() {
  try {
    await dbConnect();
    const doc = await Settings.findById(SETTINGS_ID).lean();
    if (!doc) return NextResponse.json({});
    const { _id, ...rest } = doc;
    void _id;
    return NextResponse.json(rest);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    await dbConnect();
    await Settings.updateOne(
      { _id: SETTINGS_ID },
      { $set: { ...body, updatedAt: new Date() } },
      { upsert: true },
    );
    clearCredentialsCache();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
