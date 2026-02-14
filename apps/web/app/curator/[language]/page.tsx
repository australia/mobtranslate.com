import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CuratorDashboard } from '@/components/curator/CuratorDashboard';

interface PageProps {
  params: {
    language: string;
  };
}

export default async function LanguageCuratorPage({ params }: PageProps) {
  const supabase = createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/signin?redirect=/curator/' + params.language);
  }

  // Get language info
  const { data: language } = await supabase
    .from('languages')
    .select('*')
    .eq('code', params.language)
    .single();

  if (!language) {
    redirect('/curator');
  }

  // Check if user can curate this language
  const { data: canCurate } = await supabase
    .rpc('can_user_curate_language', {
      user_uuid: user.id,
      lang_id: language.id
    });

  if (!canCurate) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="text-muted-foreground">
              You don't have curator permissions for {language.name}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <CuratorDashboard 
          languageId={language.id} 
          languageName={language.name} 
        />
      </div>
    </div>
  );
}