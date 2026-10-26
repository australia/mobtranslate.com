import { applyResearchHeaders, requireResearchAdminApi } from '@/lib/research/access';

export const dynamic = 'force-dynamic';

const SCOPE = '/admin/research/field';
// Bump to drop every cached copy of the field app shell.
const VERSION = 'field-shell-v1';

/**
 * Service worker for the field app only, so it opens out on Country with no
 * signal. It caches the app shell and the immutable build assets it loads;
 * finds and map bundles live in IndexedDB, managed by the app itself. API
 * responses are never cached here.
 */
const worker = `
const SCOPE = ${JSON.stringify(SCOPE)};
const SHELL = SCOPE;
const CACHE = ${JSON.stringify(VERSION)};
const MAP_WORKER = '/api/admin/research/quinkan/static/maplibre-gl-worker.mjs';

async function cacheShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch(SHELL, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok || response.redirected) return;
  const html = await response.clone().text();
  await cache.put(SHELL, response);
  const assets = new Set([MAP_WORKER]);
  for (const match of html.matchAll(/(?:src|href)="(\\/_next\\/static\\/[^"]+)"/g)) assets.add(match[1]);
  await Promise.all([...assets].map(async (url) => {
    try {
      const asset = await fetch(url, { credentials: 'same-origin' });
      if (asset.ok) await cache.put(url, asset);
    } catch {}
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'refresh-shell') event.waitUntil(cacheShell().catch(() => undefined));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Opening the app: network first, the saved shell when offline.
  if (request.mode === 'navigate' && url.pathname.startsWith(SCOPE)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === SCOPE && !response.redirected) {
          const cache = await caches.open(CACHE);
          await cache.put(SHELL, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(SHELL);
        return cached || Response.error();
      }
    })());
    return;
  }

  // Build assets are content-hashed and immutable: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname === MAP_WORKER) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: url.pathname === MAP_WORKER });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
`;

export async function GET() {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const headers = applyResearchHeaders(
    new Headers({
      'content-type': 'text/javascript; charset=utf-8',
      'Service-Worker-Allowed': SCOPE,
    }),
  );
  return new Response(worker, { headers });
}
