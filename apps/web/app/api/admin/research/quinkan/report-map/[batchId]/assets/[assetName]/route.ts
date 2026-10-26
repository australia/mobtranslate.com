import {loadPublishedFieldReports} from "@/lib/research/quinkan/public-field-report";
import {loadFieldReportBaselineRelease, loadReleaseAsset} from "@/lib/research/quinkan/workspace-release";
import {requireResearchAdminApi} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {params}: Readonly<{params: Promise<{batchId: string; assetName: string}>}>,
) {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  try {
    const {batchId: rawBatchId, assetName} = await params;
    const batchId = decodeURIComponent(rawBatchId);
    if (!/^[a-zA-Z0-9._-]+$/.test(batchId)) throw new Error("invalid batch id");
    const reports = await loadPublishedFieldReports();
    const report = reports.find((candidate) => candidate.batchId === batchId);
    if (!report) throw new Error("report not published");
    const frozen = await loadFieldReportBaselineRelease(report);
    const asset = await loadReleaseAsset(frozen, assetName);
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
