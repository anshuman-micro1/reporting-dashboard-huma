import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';

export async function GET() {
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const docs = await client
      .db(process.env.MONGO_DB!)
      .collection('investigation')
      .find({})
      .sort({ investigationDate: -1 })
      .toArray();
    return NextResponse.json(
      docs.map(({ _id, ...rest }) => ({ id: _id.toString(), ...rest })),
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, personalEmail, micro1Email, notes, investigationDate } = body;

  if (!name || !notes) {
    return NextResponse.json({ error: 'name and notes are required' }, { status: 400 });
  }

  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    await client.db(process.env.MONGO_DB!).collection('investigation').insertOne({
      name,
      personalEmail: personalEmail ?? null,
      micro1Email: micro1Email ?? null,
      notes,
      status: 'open',
      investigationDate: investigationDate ?? new Date().toISOString().slice(0, 10),
      createdAt: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();

  if (!id || !['open', 'closed'].includes(status)) {
    return NextResponse.json({ error: 'id and valid status required' }, { status: 400 });
  }

  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    await client
      .db(process.env.MONGO_DB!)
      .collection('investigation')
      .updateOne({ _id: new ObjectId(id) }, { $set: { status } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}
