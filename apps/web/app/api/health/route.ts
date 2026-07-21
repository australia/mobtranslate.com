import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';

export const dynamic = 'force-dynamic';

const HEALTH_TIMEOUT_MS = 3000;

function firstRow(result: any): Record<string, unknown> | undefined {
  return Array.isArray(result) ? result[0] : result?.rows?.[0];
}

export async function GET() {
  const release = process.env.MOBTRANSLATE_RELEASE_ID?.trim() || 'development';
  const expectedMigration = process.env.MOBTRANSLATE_SCHEMA_VERSION?.trim() || null;

  try {
    const query = db.execute(sql`
      SELECT
        to_regclass('public.mobtranslate_schema_migrations') IS NOT NULL AS has_ledger,
        to_regclass('public.public_api_rate_limits') IS NOT NULL AS has_rate_limits,
        (
          SELECT filename
          FROM public.mobtranslate_schema_migrations
          ORDER BY filename DESC
          LIMIT 1
        ) AS latest_migration
    `);
    const result = await Promise.race([
      query,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('health timeout')), HEALTH_TIMEOUT_MS),
      ),
    ]);
    const row = firstRow(result);
    const latestMigration = String(row?.latest_migration || '');
    const ready =
      row?.has_ledger === true &&
      row?.has_rate_limits === true &&
      (!expectedMigration || latestMigration >= expectedMigration);

    return Response.json(
      {
        status: ready ? 'ok' : 'not_ready',
        service: 'mobtranslate-web',
        release,
        database: ready ? 'ready' : 'schema_mismatch',
        schema: latestMigration || null,
      },
      {
        status: ready ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json(
      {
        status: 'not_ready',
        service: 'mobtranslate-web',
        release,
        database: 'unavailable',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
