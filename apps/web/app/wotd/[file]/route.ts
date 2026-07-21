import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { cachePath, WOTD_DIR } from '@/lib/word-image-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Serve the runtime-generated Word-of-the-day images from disk.
//
// `next start` only serves files that existed under public/ at BUILD time, so
// images generated at runtime into public/wotd/ are not served by the static
// handler (they 404). This route streams them from disk instead. The imageUrl
// returned by /api/wotd points here (https://mobtranslate.com/wotd/<key>.jpg).
const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export async function GET(_req: NextRequest, props: { params: Promise<{ file: string }> }) {
  const { file } = await props.params

  // Only allow a bare filename (defend against traversal).
  if (!file || file.includes('/') || file.includes('\\') || file.includes('..')) {
    return new Response('Not found', { status: 404 })
  }
  const ext = path.extname(file).toLowerCase()
  const contentType = TYPES[ext]
  if (!contentType) {
    return new Response('Not found', { status: 404 })
  }

  const filePath = cachePath(WOTD_DIR, file)
  // Ensure the resolved path stays inside WOTD_DIR.
  if (!filePath.startsWith(WOTD_DIR + path.sep)) {
    return new Response('Not found', { status: 404 })
  }

  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch {
    return new Response('Not found', { status: 404 })
  }

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Immutable: each cache key is content-stable (one image per word forever).
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
