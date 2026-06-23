import { defineConfig } from 'drizzle-kit';

// Introspects the migrated Postgres (mobtranslate-pg). DATABASE_URL comes from /opt/mobtranslate/db.env.
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
