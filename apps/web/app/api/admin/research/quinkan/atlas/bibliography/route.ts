import {queryBibliography} from "@/lib/research/quinkan/atlas-data";
import {requireResearchAdminApi} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  const url = new URL(request.url);
  const result = await queryBibliography(url.searchParams.get("q") ?? "", page(url), 10);
  return Response.json(result, {headers: {"Cache-Control": "private, max-age=300, stale-while-revalidate=3600"}});
}

function page(url: URL): number {
  const parsed = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
