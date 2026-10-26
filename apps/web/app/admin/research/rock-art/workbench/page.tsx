import type { Metadata } from "next";
import Workbench from "@/components/research/rock-art/workbench/Workbench";
import {requireResearchAdminPage} from "@/lib/research/access";

export const metadata: Metadata = {
  title: "Workbench — Rock Paintings",
  description:
    "Decorrelation stretch, channel arithmetic and comparison for rock-art photography, running entirely in your browser.",
};

export default async function WorkbenchPage() {
  await requireResearchAdminPage();
  return <Workbench />;
}
