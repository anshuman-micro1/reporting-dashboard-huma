import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Fuse from 'fuse.js';
import { dbConnect } from '@/lib/db';
import { Member } from '@/lib/models/Member';

const FUZZY_THRESHOLD = 0.35;

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
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'No id provided' }, { status: 400 });

  try {
    await dbConnect();
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if ('personalEmail' in body) update.personalEmail = body.personalEmail || null;
    if ('micro1Email'   in body) update.micro1Email   = body.micro1Email   || null;
    if ('hdm'          in body) update.hdm           = body.hdm           || null;
    if ('team'         in body) update.team          = body.team          || null;
    if ('hubstaffId'   in body) update.hubstaffId    = body.hubstaffId;
    if ('hubstaffName' in body) update.hubstaffName  = body.hubstaffName;

    const result = await Member.updateOne(
      { _id: new mongoose.Types.ObjectId(id as string) },
      { $set: update },
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

    // Load all members once for fuzzy matching
    const allMembers = await Member.find({}, { hubstaffName: 1 }).lean();
    const fuse = new Fuse(allMembers, {
      keys:           ['hubstaffName'],
      includeScore:   true,
      threshold:      FUZZY_THRESHOLD,
      ignoreLocation: true,
    });

    const notFound:     string[]                              = [];
    const fuzzyMatched: { csvName: string; matchedTo: string }[] = [];
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

      // Fallback 3: fuzzy match on hubstaffName
      if (result.matchedCount === 0) {
        const hits = fuse.search(name);
        if (hits.length > 0 && (hits[0].score ?? 1) <= FUZZY_THRESHOLD) {
          const best = hits[0].item;
          result = await Member.updateOne(
            { _id: (best._id as mongoose.Types.ObjectId) },
            { $set: setFields },
          );
          if (result.matchedCount > 0) {
            fuzzyMatched.push({ csvName: name, matchedTo: best.hubstaffName });
          }
        }
      }

      if (result.matchedCount === 0) {
        notFound.push(name);
      } else {
        updated++;
      }
    }

    return NextResponse.json({ updated, fuzzyMatched, notFound });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
