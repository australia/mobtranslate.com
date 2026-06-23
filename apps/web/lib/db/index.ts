import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Lazy, single shared connection pool to the migrated Postgres (replaces the
// Supabase client). Connecting is deferred to first query so that importing this
// module (e.g. during `next build` page-data collection) never requires a live
// DATABASE_URL — only actually running a query does.

const globalForDb = globalThis as unknown as {
  _mtClient?: ReturnType<typeof postgres>;
  _mtDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function realDb() {
  if (globalForDb._mtDb) return globalForDb._mtDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const client = globalForDb._mtClient ?? postgres(connectionString, { max: 10 });
  globalForDb._mtClient = client;
  globalForDb._mtDb = drizzle(client, { schema });
  return globalForDb._mtDb;
}

// Proxy so `db` is a usable value at import time but only connects on first use.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const d = realDb() as any;
    const value = d[prop];
    return typeof value === 'function' ? value.bind(d) : value;
  },
});

export { schema };
