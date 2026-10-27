import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { rowsOf } from '@/lib/recording/sentence-studio';
import { FIELD_AREA } from './area';
import {
  baitKey,
  ConditionsIndex,
  fitConditions,
  localDay,
  situationAt,
  type ConditionsFeed,
  type ConditionsModel,
  type ConditionsRow,
  type ConditionsUnfitted,
  type RiverHour,
  type WeatherHour,
} from './conditions';
import { listFishingLogs } from './store.server';

/**
 * Weather and river feeds for the prototype area, cached in the database.
 * Open-Meteo is asked only about a coarse grid point near the station and the
 * Queensland water portal only about its public gauge, so neither learns
 * where anyone fishes.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const USER_AGENT = 'mobtranslate-field-models/0.1';
const FRESH_FOR_MS = 3 * HOUR_MS;
/** Open-Meteo's forecast endpoint reaches back this far; older hours come from its archive. */
const FORECAST_PAST_DAYS = 92;
const HOURLY = 'temperature_2m,precipitation,pressure_msl,cloud_cover,wind_speed_10m';
const WATER_PORTAL = 'https://water-monitoring.information.qld.gov.au/cgi/webservice.pl';
/** Stream water level, in the portal's variable numbering. */
const RIVER_LEVEL_VARIABLE = '100';

type OpenMeteoHourly = {
  time: string[];
  temperature_2m: Array<number | null>;
  precipitation: Array<number | null>;
  pressure_msl: Array<number | null>;
  cloud_cover: Array<number | null>;
  wind_speed_10m: Array<number | null>;
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'user-agent': USER_AGENT, ...(init?.headers ?? {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return (await response.json()) as T;
}

function toWeather(hourly: OpenMeteoHourly): WeatherHour[] {
  return hourly.time.map((time, i) => ({
    hour: new Date(`${time}:00Z`).toISOString(),
    temperatureC: hourly.temperature_2m[i] ?? null,
    precipitationMm: hourly.precipitation[i] ?? null,
    pressureHpa: hourly.pressure_msl[i] ?? null,
    cloudPct: hourly.cloud_cover[i] ?? null,
    windKmh: hourly.wind_speed_10m[i] ?? null,
  }));
}

function point(): string {
  return `latitude=${FIELD_AREA.weatherPoint.lat}&longitude=${FIELD_AREA.weatherPoint.lon}`;
}

async function fetchRecentWeather(): Promise<WeatherHour[]> {
  const body = await getJson<{ hourly: OpenMeteoHourly }>(
    `https://api.open-meteo.com/v1/forecast?${point()}&hourly=${HOURLY}&past_days=${FORECAST_PAST_DAYS}&forecast_days=8&timezone=UTC`,
  );
  return toWeather(body.hourly);
}

async function fetchArchivedWeather(from: Date, to: Date): Promise<WeatherHour[]> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const body = await getJson<{ hourly: OpenMeteoHourly }>(
    `https://archive-api.open-meteo.com/v1/archive?${point()}&hourly=${HOURLY}&start_date=${day(from)}&end_date=${day(to)}&timezone=UTC`,
  );
  return toWeather(body.hourly);
}

/** The portal speaks Queensland time as YYYYMMDDHHMMSS. */
function portalTime(date: Date): string {
  const local = new Date(date.getTime() + FIELD_AREA.utcOffsetMinutes * 60_000).toISOString();
  return local.slice(0, 19).replace(/[-:T]/g, '');
}

function fromPortalTime(value: number | string): Date {
  const s = String(value);
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00Z`;
  return new Date(Date.parse(iso) - FIELD_AREA.utcOffsetMinutes * 60_000);
}

/** The portal drops some requests with a 408; asking again usually works. */
async function withRetries<T>(work: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Hourly levels, asked for a month at a time: the portal refuses long hourly spans. */
async function fetchRiver(from: Date, to: Date): Promise<RiverHour[]> {
  // Whole hours, so the readings fall on the hour; spans share their end hour, so key by hour.
  const hours = new Map<string, RiverHour>();
  const first = new Date(Math.floor(from.getTime() / HOUR_MS) * HOUR_MS);
  for (let start = first; start < to; start = new Date(start.getTime() + 30 * DAY_MS)) {
    const end = new Date(Math.min(to.getTime(), start.getTime() + 30 * DAY_MS));
    for (const reading of await withRetries(() => fetchRiverSpan(start, end))) hours.set(reading.hour, reading);
  }
  return [...hours.values()];
}

async function fetchRiverSpan(from: Date, to: Date): Promise<RiverHour[]> {
  const body = await getJson<{
    error_num: number;
    error_msg?: string;
    return?: { traces?: Array<{ trace?: Array<{ v: string; t: number; q: number }> }> };
  }>(WATER_PORTAL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      function: 'get_ts_traces',
      version: '2',
      params: {
        site_list: FIELD_AREA.river.site,
        datasource: 'AT',
        varfrom: RIVER_LEVEL_VARIABLE,
        varto: RIVER_LEVEL_VARIABLE,
        start_time: portalTime(from),
        end_time: portalTime(to),
        data_type: 'mean',
        interval: 'hour',
        multiplier: '1',
      },
    }),
  });
  if (body.error_num !== 0) throw new Error(`Water portal: ${body.error_msg ?? body.error_num}`);
  const trace = body.return?.traces?.[0]?.trace ?? [];
  // Quality 255 marks an hour with no data.
  return trace
    .filter((point) => point.q !== 255 && Number.isFinite(Number(point.v)))
    .map((point) => ({ hour: fromPortalTime(point.t).toISOString(), levelM: Number(point.v) }));
}

async function storeWeather(hours: WeatherHour[], now: Date): Promise<void> {
  for (let i = 0; i < hours.length; i += 1000) {
    const payload = JSON.stringify(hours.slice(i, i + 1000));
    await db.execute(sql`
      insert into public.research_field_weather_hours
        (area_id, hour, temperature_c, precipitation_mm, pressure_hpa, cloud_pct, wind_kmh, forecast, fetched_at)
      select ${FIELD_AREA.id}, r.hour, r."temperatureC", r."precipitationMm", r."pressureHpa", r."cloudPct", r."windKmh",
        r.hour > ${now.toISOString()}::timestamptz, now()
      from jsonb_to_recordset(${payload}::jsonb) as r(
        hour timestamptz, "temperatureC" real, "precipitationMm" real, "pressureHpa" real, "cloudPct" real, "windKmh" real)
      on conflict (area_id, hour) do update set
        temperature_c = excluded.temperature_c, precipitation_mm = excluded.precipitation_mm,
        pressure_hpa = excluded.pressure_hpa, cloud_pct = excluded.cloud_pct, wind_kmh = excluded.wind_kmh,
        forecast = excluded.forecast, fetched_at = excluded.fetched_at`);
  }
}

async function storeRiver(hours: RiverHour[]): Promise<void> {
  for (let i = 0; i < hours.length; i += 2000) {
    const payload = JSON.stringify(hours.slice(i, i + 2000));
    await db.execute(sql`
      insert into public.research_field_river_hours (site, hour, level_m, fetched_at)
      select ${FIELD_AREA.river.site}, r.hour, r."levelM", now()
      from jsonb_to_recordset(${payload}::jsonb) as r(hour timestamptz, "levelM" real)
      on conflict (site, hour) do update set level_m = excluded.level_m, fetched_at = excluded.fetched_at`);
  }
}

type FeedState = {
  weatherFetchedAt: Date | null;
  weatherEarliest: Date | null;
  riverFetchedAt: Date | null;
  riverLatest: Date | null;
  riverEarliest: Date | null;
};

async function feedState(): Promise<FeedState> {
  const rows = rowsOf<{
    weather_fetched: Date | string | null;
    weather_earliest: Date | string | null;
    river_fetched: Date | string | null;
    river_latest: Date | string | null;
    river_earliest: Date | string | null;
  }>(
    await db.execute(sql`
      select
        (select max(fetched_at) from public.research_field_weather_hours where area_id = ${FIELD_AREA.id}) as weather_fetched,
        (select min(hour) from public.research_field_weather_hours where area_id = ${FIELD_AREA.id}) as weather_earliest,
        (select max(fetched_at) from public.research_field_river_hours where site = ${FIELD_AREA.river.site}) as river_fetched,
        (select max(hour) from public.research_field_river_hours where site = ${FIELD_AREA.river.site}) as river_latest,
        (select min(hour) from public.research_field_river_hours where site = ${FIELD_AREA.river.site}) as river_earliest`),
  );
  const d = (v: Date | string | null) => (v === null ? null : new Date(v));
  return {
    weatherFetchedAt: d(rows[0]?.weather_fetched ?? null),
    weatherEarliest: d(rows[0]?.weather_earliest ?? null),
    riverFetchedAt: d(rows[0]?.river_fetched ?? null),
    riverLatest: d(rows[0]?.river_latest ?? null),
    riverEarliest: d(rows[0]?.river_earliest ?? null),
  };
}

/** A feed failure in one short line for the screen; the detail goes to the server log. */
function briefly(reason: unknown): string {
  console.error('[research/field] conditions feed failed', reason);
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const cause = error.cause instanceof Error ? error.cause.message : null;
  return (cause ?? error.message).split('\n')[0].slice(0, 160);
}

let refreshing: Promise<string[]> | null = null;

/**
 * Bring the feeds up to date: the last three months and the week ahead, plus
 * anything older back to `since` (the first fishing log). Returns problems,
 * if any, in words; a feed that fails leaves the cached hours in place.
 */
export function refreshConditions(since: Date | null = null, now = new Date()): Promise<string[]> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const problems: string[] = [];
    const state = await feedState();
    const stale = (fetched: Date | null) => !fetched || now.getTime() - fetched.getTime() > FRESH_FOR_MS;
    const recentFrom = new Date(now.getTime() - (FORECAST_PAST_DAYS - 2) * DAY_MS);
    // A week before the first log, so its "rain this week" is known too.
    const needFrom = since ? new Date(since.getTime() - 8 * DAY_MS) : null;

    const weather = async () => {
      if (stale(state.weatherFetchedAt)) await storeWeather(await fetchRecentWeather(), now);
      if (needFrom && needFrom < recentFrom && (!state.weatherEarliest || state.weatherEarliest > needFrom)) {
        const until = state.weatherEarliest && state.weatherEarliest < recentFrom ? state.weatherEarliest : recentFrom;
        for (let from = needFrom; from < until; from = new Date(from.getTime() + 365 * DAY_MS)) {
          const to = new Date(Math.min(until.getTime(), from.getTime() + 365 * DAY_MS));
          await storeWeather(await fetchArchivedWeather(from, to), now);
        }
      }
    };
    const river = async () => {
      if (stale(state.riverFetchedAt)) {
        const from = state.riverLatest ? new Date(Math.max(state.riverLatest.getTime() - 2 * DAY_MS, now.getTime() - 120 * DAY_MS)) : new Date(now.getTime() - 120 * DAY_MS);
        await storeRiver(await fetchRiver(from, now));
      }
      if (needFrom && (!state.riverEarliest || state.riverEarliest > needFrom)) {
        const until = state.riverEarliest ?? now;
        for (let from = needFrom; from < until; from = new Date(from.getTime() + 365 * DAY_MS)) {
          await storeRiver(await fetchRiver(from, new Date(Math.min(until.getTime(), from.getTime() + 365 * DAY_MS))));
        }
      }
    };
    const [w, r] = await Promise.allSettled([weather(), river()]);
    if (w.status === 'rejected') problems.push(`Weather didn’t update: ${briefly(w.reason)}`);
    if (r.status === 'rejected') problems.push(`River level didn’t update: ${briefly(r.reason)}`);
    return problems;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function readWeather(from: Date, to: Date): Promise<WeatherHour[]> {
  const rows = rowsOf<{ hour: Date | string; temperature_c: number | null; precipitation_mm: number | null; pressure_hpa: number | null; cloud_pct: number | null; wind_kmh: number | null }>(
    await db.execute(sql`
      select hour, temperature_c, precipitation_mm, pressure_hpa, cloud_pct, wind_kmh
      from public.research_field_weather_hours
      where area_id = ${FIELD_AREA.id} and hour between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz
      order by hour`),
  );
  const n = (v: number | null) => (v === null ? null : Number(v));
  return rows.map((r) => ({
    hour: new Date(r.hour).toISOString(),
    temperatureC: n(r.temperature_c),
    precipitationMm: n(r.precipitation_mm),
    pressureHpa: n(r.pressure_hpa),
    cloudPct: n(r.cloud_pct),
    windKmh: n(r.wind_kmh),
  }));
}

async function readRiver(from: Date, to: Date): Promise<RiverHour[]> {
  const rows = rowsOf<{ hour: Date | string; level_m: number }>(
    await db.execute(sql`
      select hour, level_m from public.research_field_river_hours
      where site = ${FIELD_AREA.river.site} and hour between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz
      order by hour`),
  );
  return rows.map((r) => ({ hour: new Date(r.hour).toISOString(), levelM: Number(r.level_m) }));
}

/** The last eight days and the week ahead: what the phone needs for "now" and the outlook. */
export async function conditionsFeed(now = new Date()): Promise<ConditionsFeed & { problems: string[] }> {
  const problems = await refreshConditions(null, now);
  const from = new Date(now.getTime() - 8 * DAY_MS);
  const [weather, river] = await Promise.all([readWeather(from, new Date(now.getTime() + 8 * DAY_MS)), readRiver(from, now)]);
  return { fetchedAt: now.toISOString(), weather, river, riverName: FIELD_AREA.river.name, problems };
}

/** Fit the when-and-bait model for one animal from every fishing log. */
export async function fitTargetConditions(targetId: string, now = new Date()): Promise<{ model: ConditionsModel | ConditionsUnfitted; problems: string[] }> {
  const logs = await listFishingLogs(20_000);
  if (logs.length === 0) return { model: fitConditions(targetId, [], now), problems: [] };
  const times = logs.map((l) => Date.parse(l.observedAt));
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));
  const problems = await refreshConditions(first, now);
  const [weather, river] = await Promise.all([
    readWeather(new Date(first.getTime() - 8 * DAY_MS), new Date(last.getTime() + HOUR_MS)),
    readRiver(new Date(first.getTime() - 8 * DAY_MS), new Date(last.getTime() + HOUR_MS)),
  ]);
  const index = new ConditionsIndex(weather, river);
  const rows: ConditionsRow[] = logs.map((log) => {
    const at = new Date(log.observedAt);
    return {
      situation: situationAt(at, index, log.latitude, log.longitude),
      bait: baitKey(log.bait),
      positive: log.kind === 'presence' && log.targetId === targetId,
      day: localDay(at),
    };
  });
  return { model: fitConditions(targetId, rows, now), problems };
}
