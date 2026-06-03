import type { DefaultSession, DefaultJWT } from 'next-auth';

type AppRole = 'admin' | 'user' | 'hdm' | 'hdl';

declare module 'next-auth' {
  interface Session {
    user: {
      id:   string;
      role: AppRole;
    } & DefaultSession['user'];
  }

  interface User {
    id:   string;
    role: AppRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id:   string;
    role: AppRole;
  }
}
