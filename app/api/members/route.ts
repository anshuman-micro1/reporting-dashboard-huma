import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

interface CsvRow {
  name: string;
  personalEmail: string;
  expertEmail: string;
  hdm: string;
  team: string;
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
