import {OperationalAtlas} from "@/components/research/quinkan/operational-atlas";
import {connection} from "next/server";
import {requireResearchAdminPage} from "@/lib/research/access";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireResearchAdminPage();
  await connection();
  const googleMapsApiKey = process.env.QUINKAN_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim();
  return <OperationalAtlas googleMapsApiKey={googleMapsApiKey || undefined} />;
}
