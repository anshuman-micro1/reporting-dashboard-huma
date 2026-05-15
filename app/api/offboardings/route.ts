import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';

export async function GET() {
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const docs = await client
      .db(process.env.MONGO_DB!)
      .collection('offboardings')
      .find({})
      .sort({ requestDate: -1 })
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
  const { name, personalEmail, micro1Email } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    // Upsert: if a record already exists for this member, reset it to pending.
    // If no record exists, create one.
    await client
      .db(process.env.MONGO_DB!)
      .collection('offboardings')
      .updateOne(
        { name },
        {
          $set: {
            personalEmail: personalEmail ?? null,
            micro1Email: micro1Email ?? null,
            requestDate: today,
            isOffboarded: false,
            status: 'pending',
            confirmationDate: null,
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    await client
      .db(process.env.MONGO_DB!)
      .collection('offboardings')
      .deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function PATCH(req: NextRequest) {
  const { id, action } = await req.json();
  if (!id || !['confirm', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'id and valid action required' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const update =
    action === 'confirm'
      ? { isOffboarded: true, status: 'resolved', confirmationDate: today }
      : { isOffboarded: false, status: 'pending', confirmationDate: null };

  const client = new MongoClient(process.env.MONGO_URI!);
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB!);

    await db
      .collection('offboardings')
      .updateOne({ _id: new ObjectId(id) }, { $set: update });

    if (action === 'confirm') {
      // Look up member name from the offboarding record
      const offboarding = await db
        .collection('offboardings')
        .findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } });

      if (offboarding?.name) {
        // Close all open investigations for this member, prefixing notes
        const openInvestigations = await db
          .collection('investigation')
          .find({ name: offboarding.name, status: 'open' })
          .toArray();

        for (const inv of openInvestigations) {
          const prefixedNotes = `----OFFBOARDED----\n${inv.notes || ''}`.trim();
          await db
            .collection('investigation')
            .updateOne(
              { _id: inv._id },
              { $set: { status: 'closed', notes: prefixedNotes } },
            );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await client.close();
  }
}
