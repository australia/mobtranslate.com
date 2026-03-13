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
          <div className="text-center max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">Become a Curator</h1>
            <p className="text-muted-foreground mb-6">
              To contribute as a curator, please reach out to us and we&apos;ll set up your access.
              Curators help maintain and grow our Indigenous language dictionaries.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/about"
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium text-sm h-10 px-6 hover:bg-primary/90 transition-colors"
              >
                Contact Us
              </a>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background text-foreground font-medium text-sm h-10 px-6 hover:bg-accent transition-colors"
              >
                Back to Home
              </a>
            </div>
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
    redirect(`/curator/${(assignment.languages as any).code}`);
  }

  return null;
}