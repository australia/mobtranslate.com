import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RecordingStudio } from './studio/RecordingStudio';
import type { LanguageOption } from './studio/api';

export const dynamic = 'force-dynamic';

export default async function RecordingsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/signin?redirect=/admin/recordings');

  const { data: isAdmin } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_names: ['super_admin', 'dictionary_admin'],
  });
  if (!isAdmin) redirect('/');

  const { data: langs } = await supabase
    .from('languages')
    .select('id, code, name')
    .eq('is_active', true)
    .order('name');

  const languages = (langs ?? []) as LanguageOption[];

  if (languages.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <h1 className="text-2xl font-bold text-foreground">Recording studio</h1>
        <p className="mt-2 text-muted-foreground">No active languages found. Add a language first.</p>
      </div>
    );
  }

  // Default to Kuku Yalanji where present, else the first language.
  const initial = languages.find((l) => l.code === 'kuku_yalanji') ?? languages[0];

  return <RecordingStudio languages={languages} initialLanguageId={initial.id} />;
}
