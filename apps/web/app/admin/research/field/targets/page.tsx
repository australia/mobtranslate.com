import FieldTargets from '@/components/research/field/FieldTargets';
import { requireResearchAdminPage } from '@/lib/research/access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Field models' };

export default async function FieldTargetsPage() {
  await requireResearchAdminPage();
  return <FieldTargets />;
}
