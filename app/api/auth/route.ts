// Auth is now handled by NextAuth at /api/auth/[...nextauth]
// This route is kept only for the legacy sign-out path called from older client code.
import { NextResponse } from 'next/server';

export async function DELETE() {
  // NextAuth sign-out clears its own session cookie via /api/auth/signout.
  // This endpoint clears the old custom cookie for backwards compatibility.
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('auth_token');
  return res;
}
