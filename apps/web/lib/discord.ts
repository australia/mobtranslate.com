/**
 * Fire-and-forget Discord activity events.
 *
 * Posts a compact embed to the owner's monitoring webhook so user activity
 * (signups, sign-ins, translations, TTS plays, recording uploads, dictionary
 * searches, client page opens) is visible at a glance.
 *
 * Like lib/usage-log.ts, every helper here is best-effort: it swallows its own
 * errors and NEVER blocks or breaks a user-facing request/response. The webhook
 * URL is read from the server-side env (process.env.DISCORD_WEBHOOK_URL) — it is
 * never bundled into client code. If the var is unset, every helper is a no-op.
 */

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEvent {
  title: string;
  description?: string;
  fields?: DiscordField[];
  color?: number;
  username?: string;
}

// Tasteful colors per activity type.
export const DISCORD_COLORS = {
  signup: 0x22c55e, // green
  signin: 0x3b82f6, // blue-ish (distinct from tts)
  recording: 0xf5b301, // gold
  tts: 0x2563eb, // blue
  translate: 0x14b8a6, // teal
  search: 0x9ca3af, // grey
  generic: 0x6b7280, // slate
} as const;

const DEFAULT_USERNAME = 'MobTranslate';
const MAX_FIELD_VALUE = 1024; // Discord hard limit per field value.
const MAX_FIELDS = 25; // Discord hard limit on embed fields.

/** Truncate to `max` chars with an ellipsis (safe for empty/undefined). */
export function truncate(s: string | null | undefined, max = 120): string {
  const str = (s ?? '').toString().replace(/\s+/g, ' ').trim();
  if (str.length <= max) return str;
  return str.slice(0, Math.max(0, max - 1)) + '…';
}

/** POST a Discord embed. Never throws; no-op when the webhook is unset. */
export async function sendDiscordEvent(event: DiscordEvent): Promise<void> {
  try {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) return;

    const fields = (event.fields ?? [])
      .filter((f) => f && f.name && f.value)
      .slice(0, MAX_FIELDS)
      .map((f) => ({
        name: truncate(f.name, 256),
        value: truncate(f.value, MAX_FIELD_VALUE),
        inline: f.inline ?? true,
      }));

    const embed: Record<string, unknown> = {
      title: truncate(event.title, 256),
      color: event.color ?? DISCORD_COLORS.generic,
      timestamp: new Date().toISOString(),
    };
    if (event.description) embed.description = truncate(event.description, 2048);
    if (fields.length) embed.fields = fields;

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Avoid Cloudflare bot challenges on the webhook host.
        'User-Agent': 'curl/8.5.0',
      },
      body: JSON.stringify({
        username: event.username ?? DEFAULT_USERNAME,
        embeds: [embed],
      }),
      // Don't let a slow webhook hang a request beyond a few seconds.
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    console.error('sendDiscordEvent failed (non-fatal):', err);
  }
}

// ---------------------------------------------------------------------------
// Per-event-type helpers. Each is fire-and-forget (returns the void promise so
// callers can `void discordX(...)`). Identify the actor when known; never log
// passwords or full audio.
// ---------------------------------------------------------------------------

function actorFields(user?: { email?: string | null; name?: string | null } | null): DiscordField[] {
  const fields: DiscordField[] = [];
  if (user?.email) fields.push({ name: 'User', value: truncate(user.email, 120) });
  else if (user?.name) fields.push({ name: 'User', value: truncate(user.name, 120) });
  else fields.push({ name: 'User', value: 'anonymous' });
  return fields;
}

export function discordSignup(user: { email?: string | null; name?: string | null }): Promise<void> {
  return sendDiscordEvent({
    title: '🎉 New signup',
    color: DISCORD_COLORS.signup,
    fields: [
      { name: 'Email', value: truncate(user.email, 120) || '—' },
      { name: 'Name', value: truncate(user.name, 120) || '—' },
    ],
  });
}

export function discordSignin(user: { email?: string | null; name?: string | null }): Promise<void> {
  return sendDiscordEvent({
    title: '🔑 Sign in',
    color: DISCORD_COLORS.signin,
    fields: [
      { name: 'Email', value: truncate(user.email, 120) || '—' },
      { name: 'Name', value: truncate(user.name, 120) || '—' },
    ],
  });
}

export function discordTranslate(args: {
  language?: string | null;
  text?: string | null;
  mode?: string | null;
  user?: { email?: string | null; name?: string | null } | null;
}): Promise<void> {
  return sendDiscordEvent({
    title: '🌐 Translation',
    color: DISCORD_COLORS.translate,
    fields: [
      { name: 'Language', value: truncate(args.language, 60) || '—' },
      { name: 'Mode', value: truncate(args.mode, 30) || 'chat' },
      ...actorFields(args.user),
      { name: 'Text', value: truncate(args.text, 120) || '—', inline: false },
    ],
  });
}

export function discordTts(args: {
  language?: string | null;
  text?: string | null;
}): Promise<void> {
  return sendDiscordEvent({
    title: '🔊 TTS play',
    color: DISCORD_COLORS.tts,
    fields: [
      { name: 'Language', value: truncate(args.language, 60) || '—' },
      { name: 'Text', value: truncate(args.text, 120) || '—', inline: false },
    ],
  });
}

export function discordRecording(args: {
  language?: string | null;
  label?: string | null;
  gloss?: string | null;
  kind?: string | null;
  durationMs?: number | null;
  user?: { email?: string | null; name?: string | null } | null;
}): Promise<void> {
  const duration = args.durationMs != null ? `${(args.durationMs / 1000).toFixed(1)}s` : '—';
  return sendDiscordEvent({
    title: '🎙️ Recording uploaded',
    color: DISCORD_COLORS.recording,
    fields: [
      { name: 'Language', value: truncate(args.language, 60) || '—' },
      { name: 'Kind', value: truncate(args.kind, 30) || 'word' },
      { name: 'Duration', value: duration },
      ...actorFields(args.user),
      { name: 'Label', value: truncate(args.label, 120) || '—', inline: false },
      ...(args.gloss ? [{ name: 'Gloss', value: truncate(args.gloss, 120), inline: false }] : []),
    ],
  });
}

export function discordSearch(args: {
  query?: string | null;
  language?: string | null;
  results?: number | null;
}): Promise<void> {
  return sendDiscordEvent({
    title: '🔍 Dictionary search',
    color: DISCORD_COLORS.search,
    fields: [
      { name: 'Query', value: truncate(args.query, 120) || '—' },
      ...(args.language ? [{ name: 'Language', value: truncate(args.language, 60) }] : []),
      ...(args.results != null ? [{ name: 'Results', value: String(args.results) }] : []),
    ],
  });
}

/** Generic client-reported event (from /api/events). Sanitized by the caller. */
export function discordClientEvent(type: string, meta?: Record<string, unknown>): Promise<void> {
  const fields: DiscordField[] = [];
  if (meta) {
    for (const [k, v] of Object.entries(meta).slice(0, 20)) {
      fields.push({ name: truncate(k, 60), value: truncate(typeof v === 'string' ? v : JSON.stringify(v), 200) || '—' });
    }
  }
  return sendDiscordEvent({
    title: `📲 ${truncate(type, 80) || 'event'}`,
    color: DISCORD_COLORS.generic,
    fields,
  });
}
