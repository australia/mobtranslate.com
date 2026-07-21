import { createHash, createHmac } from 'node:crypto';

function cacheSecret(): string | null {
  return (
    process.env.MOBTRANSLATE_TTS_CACHE_SECRET?.trim() ||
    process.env.MOBTRANSLATE_RATE_LIMIT_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    null
  );
}

export function ttsInputFingerprint(
  languageCode: string,
  text: string,
  model: string,
): string {
  const payload = JSON.stringify([languageCode, text, model]);
  const secret = cacheSecret();
  return secret
    ? createHmac('sha256', secret).update(payload).digest('hex')
    : createHash('sha256').update(payload).digest('hex');
}
