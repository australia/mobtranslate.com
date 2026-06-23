import { redirect } from 'next/navigation';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import { CuratorDashboard } from '@/components/curator/CuratorDashboard';

export default async function CuratorOverviewPage() {
  // Check authentication
  const user = await getSessionUser();
  if (!user) {
    redirect('/auth/signin?redirect=/curator');
  }

  // Check if user is curator
  const isCurator = await userHasRole(user.id, ['curator', 'dictionary_admin', 'super_admin']);

  if (!isCurator) {
    redirect('/');
  }

  return <CuratorDashboard />;
}
