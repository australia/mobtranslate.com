import {NextResponse} from "next/server";
import {loadConfiguredPublicRelease} from "@/lib/research/quinkan/public-release";
import {loadConfiguredWorkspaceRelease, warmProposalDetailIndex} from "@/lib/research/quinkan/workspace-release";
import {requireResearchAdminApi} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  try {
    const [operational, publicRelease] = await Promise.all([
      loadConfiguredWorkspaceRelease(),
      loadConfiguredPublicRelease(),
    ]);
    warmProposalDetailIndex();
    // Releases record overlay URLs for the standalone portal; the loader has
    // already bound each overlay to assets/<id>.png, so serve it from here.
    const workspace = {
      ...operational.workspace,
      overlays: operational.workspace.overlays.map((overlay) => ({
        ...overlay,
        assetUrl: `/api/admin/research/quinkan/workspace/assets/${overlay.id}.png`,
      })),
    };
    return NextResponse.json(
      {workspace, contextAtlas: publicRelease.payloads["atlas-map.json"]},
      {headers: {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}},
    );
  } catch {
    return NextResponse.json({error: "The verified operational release could not be loaded."}, {status: 503});
  }
}
