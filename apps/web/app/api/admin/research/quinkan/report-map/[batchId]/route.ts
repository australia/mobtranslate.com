import {NextResponse} from "next/server";
import {loadPublishedFieldReports} from "@/lib/research/quinkan/public-field-report";
import {loadConfiguredWorkspaceRelease, loadFieldReportBaselineRelease} from "@/lib/research/quinkan/workspace-release";
import type {ReportMapPayload} from "@/lib/research/quinkan/report-map-types";
import {requireResearchAdminApi} from "@/lib/research/access";

export const dynamic = "force-dynamic";

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

export async function GET(
  _request: Request,
  {params}: Readonly<{params: Promise<{batchId: string}>}>,
): Promise<NextResponse> {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  const {batchId: rawBatchId} = await params;
  const batchId = decodeURIComponent(rawBatchId);
  if (!/^[a-zA-Z0-9._-]+$/.test(batchId)) {
    return NextResponse.json({error: "invalid_batch_id"}, {status: 404});
  }
  try {
    const reports = await loadPublishedFieldReports();
    const report = reports.find((candidate) => candidate.batchId === batchId);
    if (!report) return NextResponse.json({error: "report_not_published"}, {status: 404});

    const [frozen, current] = await Promise.all([
      loadFieldReportBaselineRelease(report),
      loadConfiguredWorkspaceRelease(),
    ]);

    const regionalCollection = frozen.workspace.proposalCollections.find((collection) => collection.id === "regional");
    if (!regionalCollection) throw new Error("frozen release has no regional collection");
    const algorithmOrder = regionalCollection.modelIds;
    const firstScores = frozen.workspace.proposals.find((proposal) => proposal.collectionId === "regional")?.algorithmScores ?? [];
    const algorithms = algorithmOrder.map((modelId) => ({
      modelId,
      title: firstScores.find((score) => score.modelId === modelId)?.title ?? modelId,
    }));

    // Compact rows: [longitude, latitude, rank(algorithm 0), rank(algorithm 1), ...]
    const frozenBand = frozen.workspace.proposals
      .filter((proposal) => proposal.collectionId === "regional")
      .map((proposal) => [
        round6(proposal.longitude),
        round6(proposal.latitude),
        ...algorithmOrder.map((modelId) => {
          const score = proposal.algorithmScores.find((entry) => entry.modelId === modelId);
          return score ? round4(score.rankPercentile) : -1;
        }),
      ]);

    const caves = current.workspace.fieldObservations
      .filter((observation) => observation.role === "confirmed_cave_field_observation")
      .map((observation) => ({
        id: observation.id,
        workingName: observation.workingName,
        longitude: observation.longitude,
        latitude: observation.latitude,
        attestation: observation.attestation,
      }));

    const frozenObservations = frozen.workspace.fieldObservations.map((observation) => ({
      id: observation.id,
      workingName: observation.workingName,
      role: observation.role === "camp" ? ("camp" as const) : ("training" as const),
      longitude: observation.longitude,
      latitude: observation.latitude,
    }));

    const hillshade = frozen.workspace.overlays.find((overlay) => overlay.id === "hillshade") ?? null;

    const payload: ReportMapPayload = {
      batchId: report.batchId,
      baselineReleaseId: frozen.workspace.releaseId,
      baselineWorkspaceSha256: frozen.workspaceMapSha256,
      currentReleaseId: current.workspace.releaseId,
      caveCountMatchesReport: caves.length === report.aggregate.pointCount,
      bounds: frozen.workspace.bounds,
      imageCorners: frozen.workspace.imageCorners,
      basemaps: frozen.workspace.basemaps,
      hillshadeAsset: hillshade
        ? {url: `/api/admin/research/quinkan/report-map/${encodeURIComponent(report.batchId)}/assets/hillshade.png`, attributionSourceId: hillshade.id}
        : null,
      regional: {
        title: regionalCollection.title,
        resolutionMetres: regionalCollection.resolutionMetres,
        evaluatedCells: regionalCollection.evaluatedCells,
        publishedMarkers: regionalCollection.publishedMarkers,
        minimumPublishedPercentile: regionalCollection.minimumPublishedPercentile,
        warning: regionalCollection.warning,
        algorithms,
      },
      frozenBand,
      caves,
      frozenObservations,
      approvals: {
        baseline: frozen.approvalSummary,
        current: current.approvalSummary,
      },
      warning: frozen.workspace.warning,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({error: "report_map_verification_failed"}, {status: 503, headers: {"Cache-Control": "no-store"}});
  }
}
