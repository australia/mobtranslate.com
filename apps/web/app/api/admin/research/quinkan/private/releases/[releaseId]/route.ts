import {authorizePrivateRequest, logPrivateAuthorizationFailure, privateAuthFailure} from "@/lib/research/quinkan-private/authorize";
import {privateJson} from "@/lib/research/quinkan-private/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {params: Promise<{releaseId: string}>};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const authorized = await authorizePrivateRequest("private_workspace:read");
    const {releaseId} = await context.params;
    if (releaseId !== authorized.release.manifest.release_id) {
      return privateJson({error: "private_release_not_selected"}, 404);
    }
    const {manifest, admission} = authorized.release;
    return privateJson({
      release: {
        release_id: manifest.release_id,
        admitted_at_utc: manifest.admitted_at_utc,
        authority_record_id: manifest.authority_record_id,
        access_policy_id: manifest.access_policy_id,
        classification: manifest.classification,
        evidence_status: manifest.evidence_status,
        disclosure_scope: manifest.disclosure_scope,
        public_disclosure_allowed: manifest.public_disclosure_allowed,
        source_inventory_sha256: manifest.source_inventory_sha256,
        admission_sha256: manifest.admission_sha256,
        warnings: admission.warnings,
        exact_geometry_visible: false,
        exports_enabled: false,
      },
    });
  } catch (error) {
    logPrivateAuthorizationFailure(error);
    return privateAuthFailure();
  }
}
