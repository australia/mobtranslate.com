import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CuratorDashboard } from '@/components/curator/CuratorDashboard';

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

  // If user has global role or multiple language assignments, let them choose
  const globalRole = curatorAssignments.find(a => !a.language_id);
  
  if (globalRole || curatorAssignments.length > 1) {
    // For now, show a language selector
    const { data: languages } = await supabase
      .from('languages')
      .select('*')
      .eq('is_active', true)
      .order('name');

    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-8">Select a Language to Curate</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {languages?.map((language) => (
              <a
                key={language.id}
                href={`/curator/${language.code}`}
                className="p-6 border rounded-lg hover:shadow-lg transition-shadow"
              >
                <h2 className="text-xl font-semibold">{language.name}</h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  {language.code}
                </p>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If user only curates one language, redirect there
  const assignment = curatorAssignments[0];
  if (assignment.languages) {
    redirect(`/curator/${assignment.languages.code}`);
  }

  return null;
}