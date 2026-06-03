import type { DefaultSession, DefaultJWT } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id:   string;
      role: 'admin' | 'user';
    } & DefaultSession['user'];
  }

  interface User {
    id:   string;
    role: 'admin' | 'user';
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id:   string;
    role: 'admin' | 'user';
  }
}
