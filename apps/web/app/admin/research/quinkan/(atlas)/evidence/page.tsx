import {notFound} from "next/navigation";
import {PublicAtlas} from "@/components/research/quinkan/public-atlas";
import {loadAtlasData} from "@/lib/research/quinkan/atlas-data";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  await requireResearchAdminPage();
  try {
    const {overview} = await loadAtlasData();
    return <PublicAtlas overview={overview} />;
  } catch {
    notFound();
  }
}
