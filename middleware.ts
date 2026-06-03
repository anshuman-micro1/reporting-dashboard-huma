import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/api/auth'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Admin-only: user management page and API
  if (pathname.startsWith('/users') || pathname.startsWith('/api/users')) {
    if (token.role !== 'admin') {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // QC-only: allow admin, hdm, hdl
  if (pathname.startsWith('/qc') || pathname.startsWith('/api/qc')) {
    if (!(token.role === 'admin' || token.role === 'hdm' || token.role === 'hdl')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg|.*\\.ico|.*\\.webp).*)',
  ],
};
