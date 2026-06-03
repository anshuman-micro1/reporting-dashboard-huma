// One-time setup route — creates the first admin user.
// Returns 403 once any user exists in the database.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/db';
import { User } from '@/lib/models/User';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const count = await User.countDocuments();
    if (count > 0) {
      return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });
    }

    const { email, name, password } = await req.json();
    if (!email || !name || !password) {
      return NextResponse.json({ error: 'email, name and password are required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ email: email.toLowerCase().trim(), name, role: 'admin', passwordHash, isActive: true });

    return NextResponse.json({ ok: true, message: 'Admin user created. This endpoint is now disabled.' });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
