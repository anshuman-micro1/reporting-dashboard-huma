import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';

interface CsvRow {
  name: string;
  personalEmail: string;
  expertEmail: string;
  hdm: string;
  team: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const col = client.db(process.env.MONGO_DB!).collection('members');
    const docs = await col.find({
      $or: [
        { hubstaffName:  { $regex: escaped, $options: 'i' } },
        { personalEmail: { $regex: escaped, $options: 'i' } },
        { micro1Email:   { $regex: escaped, $options: 'i' } },
      ],
    }).limit(15).toArray();

    return NextResponse.json(docs.map(d => ({
      id:            d._id.toString(),
      name:          d.hubstaffName   ?? null,
      personalEmail: d.personalEmail  ?? null,
      micro1Email:   d.micro1Email    ?? null,
      hdm:           d.hdm            ?? null,
      team:          d.team           ?? null,
    })));
  } finally {
    await client.close();
  }
}

export async function PATCH(req: NextRequest) {
  const { id, personalEmail, micro1Email, hdm, team } = await req.json();
  if (!id) return NextResponse.json({ error: 'No id provided' }, { status: 400 });

  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const col = client.db(process.env.MONGO_DB!).collection('members');
    const result = await col.updateOne(
      { _id: new ObjectId(id as string) },
      { $set: {
        personalEmail: personalEmail || null,
        micro1Email:   micro1Email   || null,
        hdm:           hdm           || null,
        team:          team          || null,
        updatedAt:     new Date(),
      }},
    );
    if (result.matchedCount === 0) return NextResponse.json({ error: 'Expert not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } finally {
    await client.close();
  }
}

export async function POST(req: NextRequest) {
  const rows: CsvRow[] = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const collection = client.db(process.env.MONGO_DB!).collection('members');

    const notFound: string[] = [];
    let updated = 0;

    for (const row of rows) {
      const name          = row.name?.trim();
      const personalEmail = row.personalEmail?.trim();
      if (!name) continue;

      const setFields = {
        personalEmail: personalEmail || null,
        micro1Email:   row.expertEmail?.trim() || null,
        hdm:           row.hdm?.trim()         || null,
        team:          row.team?.trim()        || null,
      };

      let result = await collection.updateOne(
        { $expr: { $eq: [{ $toLower: '$hubstaffName' }, name.toLowerCase()] } },
        { $set: setFields },
      );

      // Fallback 1: match by personal email
      if (result.matchedCount === 0 && personalEmail) {
        result = await collection.updateOne(
          { $expr: { $eq: [{ $toLower: '$personalEmail' }, personalEmail.toLowerCase()] } },
          { $set: setFields },
        );
      }

      // Fallback 2: match by micro1Email
      const micro1Email = row.expertEmail?.trim();
      if (result.matchedCount === 0 && micro1Email) {
        result = await collection.updateOne(
          { $expr: { $eq: [{ $toLower: '$micro1Email' }, micro1Email.toLowerCase()] } },
          { $set: setFields },
        );
      }

      if (result.matchedCount === 0) {
        notFound.push(name);
      } else {
        updated++;
      }
    }

    return NextResponse.json({ updated, notFound });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}
