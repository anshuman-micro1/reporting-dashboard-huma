import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { User } from '@/lib/models/User';

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.role !== 'admin') return null;
  return token;
}

// GET /api/users — list all users
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await dbConnect();
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json(
      users.map(u => ({
        id:        (u._id as mongoose.Types.ObjectId).toString(),
        email:     u.email,
        name:      u.name,
        role:      u.role,
        isActive:  u.isActive,
        hasPassword: !!u.passwordHash,
        createdAt: u.createdAt,
      })),
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/users — create a user
export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { email, name, role, password } = await req.json();
    if (!email || !name) {
      return NextResponse.json({ error: 'email and name are required' }, { status: 400 });
    }
    if (!['admin', 'user'].includes(role)) {
      return NextResponse.json({ error: 'role must be admin or user' }, { status: 400 });
    }
    if (password && password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    await dbConnect();
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const user = await User.create({
      email:        email.toLowerCase().trim(),
      name:         name.trim(),
      role,
      passwordHash,
      isActive:     true,
      createdAt:    new Date(),
      updatedAt:    new Date(),
    });
    return NextResponse.json({ ok: true, id: user._id.toString() });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    const status = msg.includes('duplicate key') ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? 'Email already exists' : msg }, { status });
  }
}

// PATCH /api/users — update role, active status, or password
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { id, role, isActive, password } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    await dbConnect();
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (role     !== undefined) update.role     = role;
    if (isActive !== undefined) update.isActive = isActive;
    if (password) {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      update.passwordHash = await bcrypt.hash(password, 12);
    }

    const result = await User.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: update });
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/users — delete a user
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Prevent admins from deleting themselves
    if (admin.id === id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await dbConnect();
    await User.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
