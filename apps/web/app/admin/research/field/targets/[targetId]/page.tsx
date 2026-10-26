import { redirect } from 'next/navigation';
import { requireResearchAdminPage } from '@/lib/research/access';
import { targetIdPattern } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';

/** Model pages now live inside the field app. */
export default async function FieldTargetPage({ params }: { params: Promise<{ targetId: string }> }) {
  await requireResearchAdminPage();
  const { targetId } = await params;
  redirect(targetIdPattern.test(targetId) ? `/admin/research/field?target=${targetId}` : '/admin/research/field');
}
