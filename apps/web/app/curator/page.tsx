import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  languages as languagesT,
  userRoleAssignments as uraT,
  userRoles as rolesT,
} from '@/lib/db/schema';
import { CuratorDashboard } from '@/components/curator/CuratorDashboard';

export default async function CuratorPage() {
  // Check authentication
  const user = await getSessionUser();
  if (!user) {
    redirect('/auth/signin?redirect=/curator');
  }

  // Get languages where user is a curator.
  // user_roles is an inner join so the role-name filter actually restricts the
  // returned assignments (a plain embed filter leaves non-matching parents in place).
  const rows = await db
    .select({
      languageId: uraT.languageId,
      language: languagesT,
      roleName: rolesT.name,
    })
    .from(uraT)
    .innerJoin(rolesT, eq(uraT.roleId, rolesT.id))
    .leftJoin(languagesT, eq(uraT.languageId, languagesT.id))
    .where(
      and(
        eq(uraT.userId, user.id),
        eq(uraT.isActive, true),
        inArray(rolesT.name, ['curator', 'dictionary_admin', 'super_admin'])
      )
    );

  const curatorAssignments = rows.map((r) => ({
    language_id: r.languageId,
    languages: r.language ? { id: r.language.id, name: r.language.name, code: r.language.code } : null,
    user_roles: { name: r.roleName },
  }));

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
