import { NextRequest, NextResponse } from "next/server";
import {requireResearchAdminApi} from "@/lib/research/access";

// Proxy to the local palimpsest inference service. The image is forwarded to
// 127.0.0.1 only — this site's own machine — processed in memory, not stored.
const SERVICE = process.env.PALIMPSEST_URL ?? "http://127.0.0.1:7876";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  const body = await req.arrayBuffer();
  if (body.byteLength === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }
  if (body.byteLength > 24 * 1024 * 1024) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }
  try {
    const res = await fetch(`${SERVICE}/analyze`, {
      method: "POST",
      body,
      headers: { "content-type": "application/octet-stream" },
      signal: AbortSignal.timeout(55_000),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "palimpsest service unavailable" },
      { status: 503 },
    );
  }
}
