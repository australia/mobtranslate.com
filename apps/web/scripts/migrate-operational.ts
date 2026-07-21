import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const MIGRATION_LOCK = 2_048_615_337;
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../db/migrations');
const checkOnly = process.argv.includes('--check');
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run operational migrations.');
}

const client = postgres(databaseUrl, { max: 1 });

function digest(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

async function main() {
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS public.mobtranslate_schema_migrations (
      filename TEXT PRIMARY KEY,
      sha256 VARCHAR(64) NOT NULL,
      execution_ms INTEGER NOT NULL CHECK (execution_ms >= 0),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client`SELECT pg_advisory_lock(${MIGRATION_LOCK})`;
  try {
    const files = (await readdir(migrationsDir))
      .filter((filename) => filename.endsWith('.sql'))
      .sort();
    const applied = await client<{
      filename: string;
      sha256: string;
    }[]>`SELECT filename, sha256 FROM public.mobtranslate_schema_migrations`;
    const appliedByName = new Map(applied.map((row) => [row.filename, row.sha256]));
    const pending: Array<{ filename: string; contents: string; sha256: string }> = [];

    for (const filename of files) {
      const contents = await readFile(path.join(migrationsDir, filename), 'utf8');
      const sha256 = digest(contents);
      const recorded = appliedByName.get(filename);
      if (recorded && recorded !== sha256) {
        throw new Error(
          `Applied migration ${filename} changed: recorded ${recorded}, current ${sha256}.`,
        );
      }
      if (!recorded) pending.push({ filename, contents, sha256 });
    }

    if (checkOnly) {
      if (pending.length > 0) {
        throw new Error(`Pending operational migrations: ${pending.map((m) => m.filename).join(', ')}`);
      }
      console.log(`Operational migration check passed (${files.length} tracked).`);
      return;
    }

    for (const migration of pending) {
      const startedAt = Date.now();
      await client.begin(async (transaction) => {
        await transaction.unsafe(migration.contents);
        await transaction`
          INSERT INTO public.mobtranslate_schema_migrations
            (filename, sha256, execution_ms)
          VALUES
            (${migration.filename}, ${migration.sha256}, ${Date.now() - startedAt})
        `;
      });
      console.log(`Applied ${migration.filename}.`);
    }

    console.log(
      pending.length === 0
        ? `Operational schema is current (${files.length} tracked).`
        : `Applied ${pending.length} operational migration(s).`,
    );
  } finally {
    await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK})`;
  }
}

main().finally(() => client.end());

