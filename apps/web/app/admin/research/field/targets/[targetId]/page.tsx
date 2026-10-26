import { notFound } from 'next/navigation';
import TargetDetail from '@/components/research/field/TargetDetail';
import { requireResearchAdminPage } from '@/lib/research/access';
import { targetIdPattern } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Field model' };

export default async function FieldTargetPage({ params }: { params: Promise<{ targetId: string }> }) {
  await requireResearchAdminPage();
  const { targetId } = await params;
  if (!targetIdPattern.test(targetId)) notFound();
  return <TargetDetail targetId={targetId} />;
}
