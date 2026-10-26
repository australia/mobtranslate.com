import FieldLogger from '@/components/research/field/FieldLogger';
import { requireResearchAdminPage } from '@/lib/research/access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Field log' };

export default async function FieldLogPage() {
  await requireResearchAdminPage();
  return <FieldLogger />;
}
