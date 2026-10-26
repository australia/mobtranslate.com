import {authorizePrivateRequest, logPrivateAuthorizationFailure, privateAuthFailure} from "@/lib/research/quinkan-private/authorize";
import {loadConfiguredCathedralImage} from "@/lib/research/quinkan-private/cathedral-report-server";
import {privateJson} from "@/lib/research/quinkan-private/responses";
import {applyPrivateHeaders} from "@/lib/research/quinkan-private/security-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {params: Promise<{filename: string}>};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await authorizePrivateRequest("private_workspace:read");
    const {filename} = await context.params;
    let bytes: Buffer;
    try {
      bytes = await loadConfiguredCathedralImage(filename);
    } catch {
      return privateJson({error: "restricted_report_asset_not_found"}, 404);
    }
    const response = new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Disposition": "inline",
        "Content-Type": "image/png",
      },
    });
    applyPrivateHeaders(response.headers);
    return response;
  } catch (error) {
    logPrivateAuthorizationFailure(error);
    return privateAuthFailure();
  }
}
