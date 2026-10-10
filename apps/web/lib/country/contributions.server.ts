import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/lib/db/index';
import { rowsOf } from '@/lib/recording/sentence-studio';
import type { Contribution, ContributionFields } from './contributions';

// Uploaded photos live beside the other user media on the data disk; the
// service unit grants write access to the whole mobtranslate-storage tree.
export const COUNTRY_UPLOAD_ROOT =
  process.env.MOBTRANSLATE_COUNTRY_UPLOAD_DIR || '/mnt/donto-data/mobtranslate-storage/country';
const PHOTO_PATH = /^[a-z_]+\/[a-z0-9-]+\/[0-9a-f-]{36}\.webp$/;
const MAX_SIDE = 1600;

export function contributionPhotoUrl(photoPath: string | null): string | null {
  return photoPath ? `/api/storage/country/${photoPath}` : null;
}

// Resize, convert to WebP and drop all metadata (sharp keeps none unless asked,
// so camera GPS tags never reach the server's copy).
export async function storeContributionPhoto(
  language: string,
  target: string,
  bytes: Buffer,
): Promise<{ photoPath: string; width: number; height: number }> {
  const image = sharp(bytes, { failOn: 'error' }).rotate().resize({
    width: MAX_SIDE,
    height: MAX_SIDE,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const { data, info } = await image.webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const photoPath = `${language}/${target.replace(':', '-')}/${randomUUID()}.webp`;
  if (!PHOTO_PATH.test(photoPath)) throw new Error('Unexpected photo path');
  const absolute = path.join(COUNTRY_UPLOAD_ROOT, photoPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, data);
  return { photoPath, width: info.width, height: info.height };
}

export async function readContributionPhoto(photoPath: string): Promise<Buffer | null> {
  if (!PHOTO_PATH.test(photoPath)) return null;
  const visible = rowsOf(
    await db.execute(sql`select 1 from public.country_contributions where photo_path = ${photoPath} and status = 'visible'`),
  );
  if (!visible[0]) return null;
  try {
    return await readFile(path.join(COUNTRY_UPLOAD_ROOT, photoPath));
  } catch {
    return null;
  }
}

async function removePhotoFile(photoPath: string | null) {
  if (!photoPath || !PHOTO_PATH.test(photoPath)) return;
  await unlink(path.join(COUNTRY_UPLOAD_ROOT, photoPath)).catch(() => undefined);
}

type Row = {
  id: string;
  language_code: string;
  target: string;
  kind: Contribution['kind'];
  user_id: string | null;
  contributor_name: string;
  title: string | null;
  words: string | null;
  body: string | null;
  place_text: string | null;
  when_text: string | null;
  photo_path: string | null;
  photo_width: number | null;
  photo_height: number | null;
  created_at: string | Date;
};

function toContribution(row: Row): Contribution {
  return {
    id: row.id,
    language: row.language_code,
    target: row.target,
    kind: row.kind,
    userId: row.user_id,
    name: row.contributor_name,
    title: row.title,
    words: row.words,
    body: row.body,
    where: row.place_text,
    when: row.when_text,
    photoUrl: contributionPhotoUrl(row.photo_path),
    photoWidth: row.photo_width,
    photoHeight: row.photo_height,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const COLUMNS = sql`id, language_code, target, kind, user_id, contributor_name, title, words, body,
  place_text, when_text, photo_path, photo_width, photo_height, created_at`;

export async function listContributions(options: {
  language: string;
  target?: string;
  limit?: number;
}): Promise<Contribution[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const targetFilter = options.target ? sql`and target = ${options.target}` : sql``;
  const rows = rowsOf<Row>(
    await db.execute(sql`
      select ${COLUMNS} from public.country_contributions
      where language_code = ${options.language} and status = 'visible' ${targetFilter}
      order by created_at desc
      limit ${limit}`),
  );
  return rows.map(toContribution);
}

export async function insertContribution(
  fields: ContributionFields,
  userId: string,
  photo: { photoPath: string; width: number; height: number } | null,
): Promise<Contribution> {
  const rows = rowsOf<Row>(
    await db.execute(sql`
      insert into public.country_contributions
        (language_code, target, kind, user_id, contributor_name, title, words, body, place_text, when_text,
         photo_path, photo_width, photo_height)
      values
        (${fields.language}, ${fields.target}, ${fields.kind}, ${userId}::uuid, ${fields.name},
         ${fields.title || null}, ${fields.words || null}, ${fields.body || null}, ${fields.where || null},
         ${fields.when || null}, ${photo?.photoPath ?? null}, ${photo?.width ?? null}, ${photo?.height ?? null})
      returning ${COLUMNS}`),
  );
  return toContribution(rows[0]);
}

// Hiding keeps the row (and its attribution) but takes it off every page and
// stops its photo being served. The photo file is removed from disk.
export async function hideContribution(id: string, byUserId: string, reason: string | null): Promise<boolean> {
  const rows = rowsOf<{ photo_path: string | null }>(
    await db.execute(sql`
      update public.country_contributions
      set status = 'hidden', hidden_by = ${byUserId}::uuid, hidden_reason = ${reason}
      where id = ${id}::uuid and status = 'visible'
      returning photo_path`),
  );
  if (!rows[0]) return false;
  await removePhotoFile(rows[0].photo_path);
  return true;
}

export async function contributionOwner(id: string): Promise<string | null> {
  const rows = rowsOf<{ user_id: string | null }>(
    await db.execute(sql`select user_id from public.country_contributions where id = ${id}::uuid`),
  );
  return rows[0]?.user_id ?? null;
}
