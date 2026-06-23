import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import {
  languages as languagesT,
  userProfiles as userProfilesT,
  userRoleAssignments as uraT,
  userRoles as userRolesT,
} from '@/lib/db/schema';

export async function GET(_request: NextRequest) {
  try {
    // Authz in code (RLS is gone): admin role required.
    const { response } = await requireRole(['super_admin', 'dictionary_admin']);
    if (response) return response;

    // Fetch all user profiles
    const profiles = await db
      .select()
      .from(userProfilesT)
      .orderBy(desc(userProfilesT.createdAt));

    // Fetch active role assignments + their role and (optional) language.
    const assignmentRows = await db
      .select({
        user_id: uraT.userId,
        assigned_at: uraT.assignedAt,
        expires_at: uraT.expiresAt,
        role_id: userRolesT.id,
        role_name: userRolesT.name,
        role_display_name: userRolesT.displayName,
        language_id: languagesT.id,
        language_name: languagesT.name,
        language_code: languagesT.code,
      })
      .from(uraT)
      .innerJoin(userRolesT, eq(uraT.roleId, userRolesT.id))
      .leftJoin(languagesT, eq(uraT.languageId, languagesT.id))
      .where(eq(uraT.isActive, true));

    // Get auth user emails directly from auth.users (the route is already
    // admin-gated via requireRole; the get_auth_user_emails() SQL function is a
    // SECURITY DEFINER that gates on auth.uid(), which is null on a plain
    // connection, so we query the table directly instead).
    const emailRes: any = await db.execute(
      sql`select id, email, last_sign_in_at, email_confirmed_at from auth.users`
    );
    const authEmails: any[] = Array.isArray(emailRes) ? emailRes : emailRes?.rows ?? [];

    // Combine profiles with roles and auth emails
    const users = profiles.map((profile) => {
      const userAssignments = assignmentRows.filter((a) => a.user_id === profile.userId);
      const authEmail = authEmails.find((ae: any) => ae.id === profile.userId);

      return {
        id: profile.userId,
        email: authEmail?.email || profile.email || '',
        display_name: profile.displayName || '',
        username: profile.username || '',
        created_at: profile.createdAt,
        last_sign_in_at: authEmail?.last_sign_in_at,
        email_confirmed_at: authEmail?.email_confirmed_at,
        roles: userAssignments.map((a) => ({
          role: {
            id: a.role_id,
            name: a.role_name,
            display_name: a.role_display_name,
          },
          language: a.language_id
            ? { id: a.language_id, name: a.language_name, code: a.language_code }
            : null,
          assigned_at: a.assigned_at,
          expires_at: a.expires_at,
        })),
      };
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
