import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import dynamic from 'next/dynamic';

const CuratorDashboard = dynamic(
  () => import('@/components/curator/CuratorDashboard').then(mod => mod.CuratorDashboard),
  { ssr: false }
);

export default async function CuratorPage() {
  const supabase = createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/signin?redirect=/curator');
  }

  // Get languages where user is a curator
  const { data: curatorAssignments } = await supabase
    .from('user_role_assignments')
    .select(`
      language_id,
      languages!language_id(
        id,
        name,
        code
      ),
      user_roles!role_id(
        name
      )
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('user_roles.name', ['curator', 'dictionary_admin', 'super_admin']);

  if (!curatorAssignments || curatorAssignments.length === 0) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="text-gray-600 dark:text-gray-400">
              You need curator permissions to access this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If user has global role or multiple language assignments, show the dashboard
  const globalRole = curatorAssignments.find(a => !a.language_id);
  
  if (globalRole || curatorAssignments.length > 1) {
    return <CuratorDashboard />;
  }

  // If user only curates one language, redirect there
  const assignment = curatorAssignments[0];
  if (assignment.languages) {
    redirect(`/curator/${assignment.languages.code}`);
  }

  return null;
}