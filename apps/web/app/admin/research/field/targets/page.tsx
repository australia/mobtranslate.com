import { redirect } from 'next/navigation';
import { requireResearchAdminPage } from '@/lib/research/access';

export const dynamic = 'force-dynamic';

/** Targets now live inside the field app. */
export default async function FieldTargetsPage() {
  await requireResearchAdminPage();
  redirect('/admin/research/field');
}
