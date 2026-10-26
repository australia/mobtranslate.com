import {NextResponse} from "next/server";
import {loadProposalDetail} from "@/lib/research/quinkan/workspace-release";
import {requireResearchAdminApi} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {params}: Readonly<{params: Promise<{proposalId: string}>}>,
) {
  const {response} = await requireResearchAdminApi();
  if (response) return response;
  let proposalId = "unresolved";
  try {
    ({proposalId} = await params);
    const detail = await loadProposalDetail(proposalId);
    if (!detail) return NextResponse.json({error: "Proposal not found."}, {status: 404});
    return NextResponse.json(detail, {
      headers: {"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    });
  } catch (error) {
    console.error("[workspace/proposal] verified detail load failed", {
      proposalId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({error: "The verified proposal record could not be loaded."}, {status: 503});
  }
}
