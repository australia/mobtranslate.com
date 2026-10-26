import {NextResponse} from "next/server";
import {applyPrivateHeaders} from "./security-headers";

export function privateJson(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, {status});
  applyPrivateHeaders(response.headers);
  return response;
}
