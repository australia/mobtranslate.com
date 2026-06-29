/**
 * Email sending via Resend (REST API — no SDK dependency).
 * Configured by RESEND_API_KEY + EMAIL_FROM in the environment. If the key is
 * missing it logs and no-ops, so flows never crash in environments without email.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Mob Translate <noreply@mobtranslate.com>';
  if (!key) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', input.to);
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      // api.resend.com is behind Cloudflare, which 1010-blocks some default UAs.
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.5.0' },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error('[email] Resend send failed', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] Resend send error', err);
    return false;
  }
}

/** Minimal branded HTML wrapper for transactional emails. */
export function emailLayout(opts: { heading: string; body: string; button?: { label: string; url: string } }): string {
  const btn = opts.button
    ? `<tr><td style="padding:24px 0 8px"><a href="${opts.button.url}" style="background:#B45E2A;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">${opts.button.label}</a></td></tr>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#FAF5EF;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2A211B">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF5EF;padding:32px 16px">
   <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #E7DCD0;border-radius:16px;padding:28px">
      <tr><td style="font-weight:800;font-size:20px;color:#B45E2A;padding-bottom:8px">Mob Translate</td></tr>
      <tr><td style="font-size:22px;font-weight:700;padding-bottom:10px">${opts.heading}</td></tr>
      <tr><td style="font-size:16px;line-height:1.6;color:#2A211B">${opts.body}</td></tr>
      ${btn}
    </table>
    <div style="color:#9A8C7E;font-size:12px;padding-top:16px">Mob Translate · mobtranslate.com</div>
   </td></tr>
  </table></body></html>`;
}
