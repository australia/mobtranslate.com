import path from "node:path";
import {requireResearchAdminApi} from "@/lib/research/access";
import {serveResearchStaticFile} from "@/lib/research/static-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = process.env.MOBTRANSLATE_REPO_ROOT ?? path.resolve(process.cwd(), "../..");
const CASE_DIR = path.join(REPO_ROOT, "apps/web/data/research/rock-art/case");

type RouteContext = {params: Promise<{name: string}>};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  const {name} = await context.params;
  return serveResearchStaticFile(CASE_DIR, [name]);
}
