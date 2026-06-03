import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Offboarding } from '@/lib/models/Offboarding';
import { Investigation } from '@/lib/models/Investigation';

export async function GET() {
  try {
    await dbConnect();
    const docs = await Offboarding.find({}).sort({ requestDate: -1 }).lean();
    return NextResponse.json(
      docs.map(({ _id, ...rest }) => ({ id: (_id as mongoose.Types.ObjectId).toString(), ...rest })),
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { name, personalEmail, micro1Email } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  try {
    await dbConnect();
    await Offboarding.updateOne(
      { name },
      {
        $set: {
          personalEmail:    personalEmail ?? null,
          micro1Email:      micro1Email   ?? null,
          requestDate:      today,
          isOffboarded:     false,
          status:           'pending',
          confirmationDate: null,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    await dbConnect();
    await Offboarding.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
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
      ? { isOffboarded: true,  status: 'resolved', confirmationDate: today }
      : { isOffboarded: false, status: 'pending',  confirmationDate: null  };

  try {
    await dbConnect();
    const oid = new mongoose.Types.ObjectId(id);
    await Offboarding.updateOne({ _id: oid }, { $set: update });

    if (action === 'confirm') {
      const offboarding = await Offboarding.findById(oid).select('name').lean();
      if (offboarding?.name) {
        // Close all open investigations and prefix notes with offboarding marker
        const openInvs = await Investigation.find({ name: offboarding.name, status: 'open' }).lean();
        await Promise.all(
          openInvs.map(inv =>
            Investigation.updateOne(
              { _id: inv._id },
              { $set: { status: 'closed', notes: `----OFFBOARDED----\n${inv.notes || ''}`.trim() } },
            ),
          ),
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
