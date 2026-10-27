import 'server-only';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/lib/db/index';
import { rowsOf } from '@/lib/recording/sentence-studio';
import {
  slugifyTarget,
  type Activity,
  type FieldModelSummary,
  type FieldObservation,
  type FieldTarget,
  type ModelCard,
  type ObservationInput,
} from './types';

// Photos of finds sit with the other user media on the data disk, in their own
// tree; they are served only through the super-admin research API.
const PHOTO_ROOT = process.env.RESEARCH_FIELD_PHOTO_DIR || '/mnt/donto-data/mobtranslate-storage/research-field';
const PHOTO_PATH = /^[a-z0-9-]+\/[0-9a-f-]{36}\.webp$/;
const MAX_SIDE = 1600;

type TargetRow = {
  id: string;
  name: string;
  scientific_names: string[];
  notes: string | null;
  activity: Activity;
  presences: number;
  absences: number;
  public_records: number;
  latest_model_id: string | null;
  latest_model_at: Date | string | null;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toTarget(row: TargetRow): FieldTarget {
  return {
    id: row.id,
    name: row.name,
    scientificNames: row.scientific_names ?? [],
    notes: row.notes,
    activity: row.activity,
    presences: Number(row.presences),
    absences: Number(row.absences),
    publicRecords: Number(row.public_records),
    latestModelId: row.latest_model_id,
    latestModelAt: iso(row.latest_model_at),
  };
}

const targetSelect = sql`
  select t.id, t.name, t.scientific_names, t.notes, t.activity,
    (select count(*) from public.research_field_observations o
      where o.target_id = t.id and o.deleted_at is null and o.kind = 'presence')::int as presences,
    (select count(*) from public.research_field_observations o
      where o.target_id = t.id and o.deleted_at is null and o.kind = 'absence')::int as absences,
    (select count(*) from public.research_field_public_records p where p.target_id = t.id)::int as public_records,
    m.id as latest_model_id, m.created_at as latest_model_at
  from public.research_field_targets t
  left join lateral (
    select id, created_at from public.research_field_models
    where target_id = t.id order by created_at desc limit 1
  ) m on true`;

export async function listTargets(): Promise<FieldTarget[]> {
  const rows = rowsOf<TargetRow>(await db.execute(sql`${targetSelect} order by t.activity, t.name`));
  return rows.map(toTarget);
}

export async function getTarget(id: string): Promise<FieldTarget | null> {
  const rows = rowsOf<TargetRow>(await db.execute(sql`${targetSelect} where t.id = ${id}`));
  return rows[0] ? toTarget(rows[0]) : null;
}

export async function createTarget(
  input: { name: string; scientificNames: string[]; notes?: string; activity: Activity },
  userId: string,
): Promise<FieldTarget> {
  const base = slugifyTarget(input.name);
  const names = JSON.stringify(input.scientificNames);
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = attempt === 0 ? base : `${base.slice(0, 44)}-${attempt + 1}`;
    const inserted = rowsOf<{ id: string }>(
      await db.execute(sql`
        insert into public.research_field_targets (id, name, scientific_names, notes, activity, created_by)
        values (${id}, ${input.name}, array(select jsonb_array_elements_text(${names}::jsonb)), ${input.notes ?? null}, ${input.activity}, ${userId})
        on conflict (id) do nothing
        returning id`),
    );
    if (inserted[0]) return (await getTarget(inserted[0].id))!;
  }
  throw new Error('Could not allocate a target id');
}

export async function updateTarget(id: string, input: { name?: string; scientificNames?: string[]; notes?: string | null }) {
  const names = input.scientificNames ? JSON.stringify(input.scientificNames) : null;
  await db.execute(sql`
    update public.research_field_targets set
      name = coalesce(${input.name ?? null}, name),
      scientific_names = case when ${names}::jsonb is null then scientific_names
        else array(select jsonb_array_elements_text(${names}::jsonb)) end,
      notes = case when ${input.notes === undefined}::boolean then notes else ${input.notes ?? null} end,
      updated_at = now()
    where id = ${id}`);
}

type ObservationRow = {
  id: string;
  client_id: string;
  target_id: string;
  kind: 'presence' | 'absence';
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  observed_at: Date | string;
  notes: string | null;
  logged_by_name: string | null;
  photo_path: string | null;
  bait: string | null;
  method: FieldObservation['method'];
  catch_count: number | null;
  size_cm: number | null;
  kept: boolean | null;
};

const observationColumns = sql.raw(
  'id, client_id, target_id, kind, latitude, longitude, accuracy_m, altitude_m, observed_at, notes, logged_by_name, photo_path, bait, method, catch_count, size_cm, kept',
);

function toObservation(row: ObservationRow): FieldObservation {
  return {
    id: row.id,
    clientId: row.client_id,
    targetId: row.target_id,
    kind: row.kind,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
    altitudeM: row.altitude_m === null ? null : Number(row.altitude_m),
    observedAt: iso(row.observed_at)!,
    notes: row.notes,
    loggedByName: row.logged_by_name,
    hasPhoto: row.photo_path !== null,
    bait: row.bait,
    method: row.method,
    catchCount: row.catch_count === null ? null : Number(row.catch_count),
    sizeCm: row.size_cm === null ? null : Number(row.size_cm),
    kept: row.kept,
  };
}

export async function listObservations(targetId?: string, limit = 2000): Promise<FieldObservation[]> {
  const rows = rowsOf<ObservationRow>(
    await db.execute(sql`
      select ${observationColumns}
      from public.research_field_observations
      where deleted_at is null ${targetId ? sql`and target_id = ${targetId}` : sql``}
      order by observed_at desc
      limit ${limit}`),
  );
  return rows.map(toObservation);
}

/** Every fishing log, whatever animal: catches and spells with nothing caught. */
export async function listFishingLogs(limit = 2000): Promise<FieldObservation[]> {
  const rows = rowsOf<ObservationRow>(
    await db.execute(sql`
      select ${observationColumns}
      from public.research_field_observations o
      where o.deleted_at is null
        and o.target_id in (select id from public.research_field_targets where activity = 'fish')
      order by o.observed_at desc
      limit ${limit}`),
  );
  return rows.map(toObservation);
}

/**
 * Store a batch from the phone. client_id makes retries idempotent: an
 * observation already stored is returned as-is rather than duplicated.
 */
export async function recordObservations(inputs: ObservationInput[], userId: string): Promise<FieldObservation[]> {
  const stored: FieldObservation[] = [];
  for (const o of inputs) {
    const rows = rowsOf<ObservationRow>(
      await db.execute(sql`
        with inserted as (
          insert into public.research_field_observations
            (client_id, target_id, kind, latitude, longitude, accuracy_m, altitude_m, observed_at, notes, logged_by_name,
             bait, method, catch_count, size_cm, kept, recorded_by)
          values (${o.clientId}, ${o.targetId}, ${o.kind}, ${o.latitude}, ${o.longitude}, ${o.accuracyM ?? null},
            ${o.altitudeM ?? null}, ${o.observedAt}, ${o.notes || null}, ${o.loggedByName || null},
            ${o.bait || null}, ${o.method ?? null}, ${o.catchCount ?? null}, ${o.sizeCm ?? null}, ${o.kept ?? null}, ${userId})
          on conflict (client_id) do nothing
          returning ${observationColumns}
        )
        select * from inserted
        union all
        select ${observationColumns}
        from public.research_field_observations where client_id = ${o.clientId}
        limit 1`),
    );
    if (rows[0]) stored.push(toObservation(rows[0]));
  }
  return stored;
}

export async function deleteObservation(id: string): Promise<boolean> {
  const rows = rowsOf(
    await db.execute(sql`
      update public.research_field_observations set deleted_at = now()
      where id = ${id} and deleted_at is null returning id`),
  );
  return rows.length > 0;
}

// Resize, convert to WebP and drop all metadata, so the phone's EXIF (which
// repeats the location) never reaches the stored copy.
export async function storeObservationPhoto(id: string, bytes: Buffer): Promise<boolean> {
  const rows = rowsOf<{ target_id: string }>(
    await db.execute(sql`select target_id from public.research_field_observations where id = ${id} and deleted_at is null`),
  );
  if (!rows[0]) return false;
  const image = sharp(bytes, { failOn: 'error' }).rotate().resize({
    width: MAX_SIDE,
    height: MAX_SIDE,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const data = await image.webp({ quality: 80 }).toBuffer();
  const photoPath = `${rows[0].target_id}/${randomUUID()}.webp`;
  if (!PHOTO_PATH.test(photoPath)) throw new Error('Unexpected photo path');
  const absolute = path.join(PHOTO_ROOT, photoPath);
  await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
  await writeFile(absolute, data, { mode: 0o600 });
  await db.execute(sql`update public.research_field_observations set photo_path = ${photoPath} where id = ${id}`);
  return true;
}

export async function readObservationPhoto(id: string): Promise<Buffer | null> {
  const rows = rowsOf<{ photo_path: string | null }>(
    await db.execute(sql`select photo_path from public.research_field_observations where id = ${id} and deleted_at is null`),
  );
  const photoPath = rows[0]?.photo_path;
  if (!photoPath || !PHOTO_PATH.test(photoPath)) return null;
  try {
    return await readFile(path.join(PHOTO_ROOT, photoPath));
  } catch {
    return null;
  }
}

export type PublicRecord = {
  recordId: string;
  scientificName: string | null;
  latitude: number;
  longitude: number;
  uncertaintyM: number | null;
  eventDate: string | null;
  basisOfRecord: string | null;
  dataset: string | null;
};

/** Replace a target's ALA records with a fresh download. */
export async function replacePublicRecords(targetId: string, records: PublicRecord[]): Promise<number> {
  await db.execute(sql`delete from public.research_field_public_records where target_id = ${targetId} and source = 'ala'`);
  const chunk = 500;
  for (let i = 0; i < records.length; i += chunk) {
    const payload = JSON.stringify(records.slice(i, i + chunk));
    await db.execute(sql`
      insert into public.research_field_public_records
        (target_id, source, record_id, scientific_name, latitude, longitude, uncertainty_m, event_date, basis_of_record, dataset)
      select ${targetId}, 'ala', r."recordId", r."scientificName", r.latitude, r.longitude, r."uncertaintyM",
        r."eventDate", r."basisOfRecord", r.dataset
      from jsonb_to_recordset(${payload}::jsonb) as r(
        "recordId" text, "scientificName" text, latitude double precision, longitude double precision,
        "uncertaintyM" double precision, "eventDate" text, "basisOfRecord" text, dataset text)
      on conflict do nothing`);
  }
  return records.length;
}

export async function listPublicRecords(targetId: string): Promise<PublicRecord[]> {
  const rows = rowsOf<{
    record_id: string;
    scientific_name: string | null;
    latitude: number;
    longitude: number;
    uncertainty_m: number | null;
    event_date: string | null;
    basis_of_record: string | null;
    dataset: string | null;
  }>(
    await db.execute(sql`
      select record_id, scientific_name, latitude, longitude, uncertainty_m, event_date, basis_of_record, dataset
      from public.research_field_public_records where target_id = ${targetId}`),
  );
  return rows.map((r) => ({
    recordId: r.record_id,
    scientificName: r.scientific_name,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    uncertaintyM: r.uncertainty_m === null ? null : Number(r.uncertainty_m),
    eventDate: r.event_date,
    basisOfRecord: r.basis_of_record,
    dataset: r.dataset,
  }));
}

export async function recordModel(card: ModelCard, userId: string | null): Promise<void> {
  const field = card.local ?? card.regional;
  await db.execute(sql`
    insert into public.research_field_models (id, target_id, card, field_presences, field_absences, public_records, created_by)
    values (${card.modelId}, ${card.targetId}, ${JSON.stringify(card)}::jsonb,
      ${field?.presencesField ?? 0}, ${field?.absences ?? 0}, ${card.regional?.presencesPublic ?? 0}, ${userId})
    on conflict (id) do nothing`);
}

export async function listModels(targetId: string): Promise<FieldModelSummary[]> {
  const rows = rowsOf<{
    id: string;
    target_id: string;
    created_at: Date | string;
    field_presences: number;
    field_absences: number;
    public_records: number;
    card: ModelCard | string;
  }>(
    await db.execute(sql`
      select id, target_id, created_at, field_presences, field_absences, public_records, card
      from public.research_field_models where target_id = ${targetId}
      order by created_at desc limit 20`),
  );
  return rows.map((r) => ({
    id: r.id,
    targetId: r.target_id,
    createdAt: iso(r.created_at)!,
    fieldPresences: Number(r.field_presences),
    fieldAbsences: Number(r.field_absences),
    publicRecords: Number(r.public_records),
    card: typeof r.card === 'string' ? (JSON.parse(r.card) as ModelCard) : r.card,
  }));
}

export async function modelBelongsTo(modelId: string): Promise<string | null> {
  const rows = rowsOf<{ target_id: string }>(
    await db.execute(sql`select target_id from public.research_field_models where id = ${modelId}`),
  );
  return rows[0]?.target_id ?? null;
}
