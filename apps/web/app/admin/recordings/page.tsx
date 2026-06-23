import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { languages as languagesT } from '@/lib/db/schema';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import { RecordingStudio } from './studio/RecordingStudio';
import type { LanguageOption } from './studio/api';

export const dynamic = 'force-dynamic';

export default async function RecordingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth/signin?redirect=/admin/recordings');

  const isAdmin = await userHasRole(user.id, ['super_admin', 'dictionary_admin']);
  if (!isAdmin) redirect('/');

  const langs = await db
    .select({ id: languagesT.id, code: languagesT.code, name: languagesT.name })
    .from(languagesT)
    .where(eq(languagesT.isActive, true))
    .orderBy(asc(languagesT.name));

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
