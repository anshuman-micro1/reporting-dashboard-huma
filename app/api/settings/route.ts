import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { clearCredentialsCache } from '@/lib/credentials-cache';

const SETTINGS_ID = 'hubstaff_credentials';

export async function GET() {
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const doc = await client.db(process.env.MONGO_DB!).collection('settings').findOne({ _id: SETTINGS_ID as never });
    if (!doc) return NextResponse.json({});
    const { _id, ...rest } = doc;
    void _id;
    return NextResponse.json(rest);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    await client.db(process.env.MONGO_DB!).collection('settings').updateOne(
      { _id: SETTINGS_ID as never },
      { $set: { ...body, updatedAt: new Date() } },
      { upsert: true },
    );
    clearCredentialsCache();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}
