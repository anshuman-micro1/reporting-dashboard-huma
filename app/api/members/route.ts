import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';

interface CsvRow {
  name: string;
  personalEmail: string;
  expertEmail: string;
  hdm: string;
  team: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 4) return NextResponse.json([]);

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex   = new RegExp(escaped, 'i');

  try {
    await dbConnect();
    const docs = await Member.find({
      $or: [
        { hubstaffName:  regex },
        { personalEmail: regex },
        { micro1Email:   regex },
      ],
    }).limit(15).lean();

    return NextResponse.json(docs.map(d => ({
      id:            (d._id as mongoose.Types.ObjectId).toString(),
      name:          d.hubstaffName   ?? null,
      personalEmail: d.personalEmail  ?? null,
      micro1Email:   d.micro1Email    ?? null,
      hdm:           d.hdm            ?? null,
      team:          d.team           ?? null,
    })));
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, personalEmail, micro1Email, hdm, team } = await req.json();
  if (!id) return NextResponse.json({ error: 'No id provided' }, { status: 400 });

  try {
    await dbConnect();
    const result = await Member.updateOne(
      { _id: new mongoose.Types.ObjectId(id as string) },
      { $set: {
        personalEmail: personalEmail || null,
        micro1Email:   micro1Email   || null,
        hdm:           hdm           || null,
        team:          team          || null,
        updatedAt:     new Date(),
      }},
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Expert not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rows: CsvRow[] = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  try {
    await dbConnect();
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

      // Match by name (case-insensitive via $expr)
      let result = await Member.updateOne(
        { $expr: { $eq: [{ $toLower: '$hubstaffName' }, name.toLowerCase()] } },
        { $set: setFields },
      );

      // Fallback 1: match by personal email
      if (result.matchedCount === 0 && personalEmail) {
        result = await Member.updateOne(
          { $expr: { $eq: [{ $toLower: '$personalEmail' }, personalEmail.toLowerCase()] } },
          { $set: setFields },
        );
      }

      // Fallback 2: match by micro1Email
      const micro1Email = row.expertEmail?.trim();
      if (result.matchedCount === 0 && micro1Email) {
        result = await Member.updateOne(
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
  }
}
