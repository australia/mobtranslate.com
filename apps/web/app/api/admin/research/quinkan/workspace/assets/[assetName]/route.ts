import {loadWorkspaceAsset} from "@/lib/research/quinkan/workspace-release";
import {requireResearchAdminApi} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {params}: Readonly<{params: Promise<{assetName: string}>}>,
) {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  try {
    const {assetName} = await params;
    const asset = await loadWorkspaceAsset(assetName);
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(asset.bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${asset.sha256}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", {status: 404, headers: {"Content-Type": "text/plain; charset=utf-8"}});
  }
}
