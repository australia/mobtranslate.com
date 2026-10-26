import {requireResearchAdminApi} from "@/lib/research/access";
import {serveResearchStaticFile} from "@/lib/research/static-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The standalone portal served these from its public/ directory. Here they sit
// behind the admin guard: basemap styles, the reference overlays and gazetteer,
// the 198 MB terrain tile pyramid, and the MapLibre worker with its shared chunk.
const allowedTopLevel = new Set([
  "map-data",
  "map-styles",
  "terrain-tiles",
  "maplibre-gl-worker.mjs",
  "maplibre-gl-shared.mjs",
]);

type RouteContext = {params: Promise<{path: string[]}>};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  const {path: segments} = await context.params;
  if (!allowedTopLevel.has(segments[0] ?? "")) return serveResearchStaticFile(undefined, segments);
  return serveResearchStaticFile(process.env.QUINKAN_PORTAL_STATIC_DIR, segments);
}
