import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search');
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const collection = client.db(process.env.MONGO_DB!).collection('reports');
    let query: object = {};
    if (search?.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query = { $or: [{ memberName: regex }, { personalEmail: regex }, { micro1Email: regex }] };
    }
    const docs = await collection.find(query, { projection: { _id: 0 } }).sort({ memberName: 1 }).toArray();
    return NextResponse.json(docs);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}
