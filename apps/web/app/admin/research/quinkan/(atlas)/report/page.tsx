import {redirect} from "next/navigation";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export default async function LegacyReportPage() {
  await requireResearchAdminPage();
  redirect("/admin/research/quinkan/reports");
}
