import type { NextAuthOptions } from 'next-auth';
import GoogleProvider    from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { dbConnect } from './db';
import { User } from './models/User';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await dbConnect();
        const user = await User.findOne({ email: credentials.email.toLowerCase().trim() }).lean();
        if (!user || !user.isActive || !user.passwordHash) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return {
          id:    user._id.toString(),
          email: user.email,
          name:  user.name,
          role:  user.role,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        // Restrict to @micro1.ai domain only
        if (!user.email?.endsWith('@micro1.ai')) return false;
        // Check user is on the allowlist and active
        await dbConnect();
        const dbUser = await User.findOne({ email: user.email.toLowerCase() }).lean();
        if (!dbUser || !dbUser.isActive) return false;
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === 'google') {
          // Fetch role from DB for Google sign-ins
          await dbConnect();
          const dbUser = await User.findOne({ email: token.email! }).lean();
          token.role = dbUser?.role ?? 'user';
          token.id   = dbUser?._id.toString() ?? '';
        } else {
          // Credentials: role is set in authorize()
          token.role = user.role;
          token.id   = user.id;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id   = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  session: { strategy: 'jwt' },
};
