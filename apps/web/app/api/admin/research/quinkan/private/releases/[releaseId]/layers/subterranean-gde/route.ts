import {authorizePrivateRequest, logPrivateAuthorizationFailure, privateAuthFailure} from "@/lib/research/quinkan-private/authorize";
import {privateJson} from "@/lib/research/quinkan-private/responses";
import {applyPrivateHeaders} from "@/lib/research/quinkan-private/security-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {params: Promise<{releaseId: string}>};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const authorized = await authorizePrivateRequest("restricted_gde:read");
    const {releaseId} = await context.params;
    if (releaseId !== authorized.release.manifest.release_id) {
      return privateJson({error: "private_release_not_selected"}, 404);
    }
    const response = new Response(new Uint8Array(authorized.release.exactLayerBytes), {
      headers: {"Content-Type": "application/geo+json; charset=utf-8"},
    });
    applyPrivateHeaders(response.headers);
    return response;
  } catch (error) {
    logPrivateAuthorizationFailure(error);
    return privateAuthFailure();
  }
}
