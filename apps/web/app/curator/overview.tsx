import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CuratorDashboard } from '@/components/curator/CuratorDashboard';

export default async function CuratorOverviewPage() {
  const supabase = createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/signin?redirect=/curator');
  }

  // Check if user is curator
  const { data: isCurator } = await supabase
    .rpc('user_has_role', {
      user_uuid: user.id,
      role_names: ['curator', 'dictionary_admin', 'super_admin']
    });

  if (!isCurator) {
    redirect('/');
  }

  return <CuratorDashboard />;
}