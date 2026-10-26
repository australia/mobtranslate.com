import { NextRequest, NextResponse } from "next/server";
import {requireResearchAdminApi} from "@/lib/research/access";

const SERVICE = process.env.PALIMPSEST_URL ?? "http://127.0.0.1:7876";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  try {
    const res = await fetch(`${SERVICE}/complete_mask?samples=4&steps=25`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(280_000),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "palimpsest service unavailable or timed out" },
      { status: 503 },
    );
  }
}
