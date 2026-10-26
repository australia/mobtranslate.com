export const privateHeaders = [
  {key: "Cache-Control", value: "private, no-store, max-age=0"},
  {key: "Pragma", value: "no-cache"},
  {key: "Expires", value: "0"},
  {key: "Referrer-Policy", value: "no-referrer"},
  {key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex"},
  {key: "X-Content-Type-Options", value: "nosniff"},
  {key: "X-Frame-Options", value: "DENY"},
  {key: "Cross-Origin-Opener-Policy", value: "same-origin"},
  {key: "Cross-Origin-Resource-Policy", value: "same-origin"},
  {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
] as const;

export function applyPrivateHeaders(headers: Headers): Headers {
  for (const {key, value} of privateHeaders) headers.set(key, value);
  return headers;
}

// Scripts stay nonce-bound. Styles allow inline because mobtranslate's shared
// root layout and toaster inject unnonced styles; img/connect remain self-only,
// so inline CSS cannot reach a third-party origin.
export function privateContentSecurityPolicy(nonce: string): string {
  const development = process.env.NODE_ENV === "development";
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws:" : ""}`,
    "media-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
