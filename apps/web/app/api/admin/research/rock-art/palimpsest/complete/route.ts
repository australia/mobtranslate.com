import { NextRequest, NextResponse } from "next/server";
import {requireResearchAdminApi} from "@/lib/research/access";

const SERVICE = process.env.PALIMPSEST_URL ?? "http://127.0.0.1:7876";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  const slot = req.nextUrl.searchParams.get("slot");
  if (slot === null || !/^[0-7]$/.test(slot)) {
    return NextResponse.json({ error: "slot must be 0–7" }, { status: 400 });
  }
  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > 24 * 1024 * 1024) {
    return NextResponse.json({ error: "bad image body" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${SERVICE}/complete?slot=${slot}&samples=4&steps=25`,
      {
        method: "POST",
        body,
        headers: { "content-type": "application/octet-stream" },
        signal: AbortSignal.timeout(280_000),
      },
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "palimpsest service unavailable or timed out" },
      { status: 503 },
    );
  }
}
