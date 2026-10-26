import 'server-only';

import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { applyResearchHeaders } from './access';

const contentTypes: Record<string, string> = {
  '.geojson': 'application/geo+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

const segmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Serve one file from a configured read-only directory. Only plain path
 * segments and known extensions are accepted, and the resolved file must stay
 * inside the root without passing through a symlink. Anything else is a 404.
 */
export async function serveResearchStaticFile(root: string | undefined, segments: readonly string[]): Promise<Response> {
  const notFound = () => {
    const response = new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    applyResearchHeaders(response.headers);
    return response;
  };
  if (!root || !path.isAbsolute(root) || segments.length === 0) return notFound();
  if (segments.some((segment) => !segmentPattern.test(segment))) return notFound();
  const contentType = contentTypes[path.extname(segments[segments.length - 1]).toLowerCase()];
  if (!contentType) return notFound();

  try {
    const resolvedRoot = await realpath(root);
    const candidate = path.join(resolvedRoot, ...segments);
    const metadata = await lstat(candidate);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return notFound();
    if ((await realpath(candidate)) !== candidate) return notFound();
    const bytes = await readFile(candidate);
    const response = new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.byteLength) },
    });
    applyResearchHeaders(response.headers);
    // Immutable, admin-only map assets: the browser may keep them, shared caches may not.
    response.headers.set('Cache-Control', 'private, max-age=86400');
    return response;
  } catch {
    return notFound();
  }
}
