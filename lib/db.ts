import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI!;
const MONGO_DB  = process.env.MONGO_DB;

if (!MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

// Reuse the connection across hot-reloads in Next.js dev mode
declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
}

if (!global._mongooseCache) {
  global._mongooseCache = { conn: null, promise: null };
}

const cache = global._mongooseCache;

export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(MONGO_URI, { dbName: MONGO_DB, bufferCommands: false })
      .then(m => { cache.conn = m; return m; })
      .catch(err => { cache.promise = null; throw err; });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
