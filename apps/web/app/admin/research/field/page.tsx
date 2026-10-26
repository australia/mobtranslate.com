import FieldApp from '@/components/research/field/app/FieldApp';
import { requireResearchAdminPage } from '@/lib/research/access';
import { targetIdPattern } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Field' };
export const viewport = { themeColor: '#b45e2a', viewportFit: 'cover' };

export default async function FieldPage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  await requireResearchAdminPage();
  const { target } = await searchParams;
  return <FieldApp initialTarget={target && targetIdPattern.test(target) ? target : null} />;
}
