import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';
import { languages as languagesT } from '@/lib/db/schema';
import { CuratorDashboard } from '@/components/curator/CuratorDashboard';

interface PageProps {
  params: Promise<{
    language: string;
  }>;
}

export default async function LanguageCuratorPage(props: PageProps) {
  const params = await props.params;

  // Check authentication
  const user = await getSessionUser();
  if (!user) {
    redirect('/auth/signin?redirect=/curator/' + params.language);
  }

  // Get language info
  const langRows = await db
    .select()
    .from(languagesT)
    .where(eq(languagesT.code, params.language))
    .limit(1);
  const language = langRows[0];

  if (!language) {
    redirect('/curator');
  }

  // Check if user can curate this language (SQL function still in the DB).
  const res: any = await db.execute(
    sql`select public.can_user_curate_language(${user.id}::uuid, ${language.id}::uuid) as can_curate`
  );
  const resultRows = Array.isArray(res) ? res : res?.rows ?? [];
  const canCurate = resultRows[0]?.can_curate === true;

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
