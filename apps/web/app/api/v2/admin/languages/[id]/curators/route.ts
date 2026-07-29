import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireRole } from '@/lib/auth-helpers';
import {
  curatorActivities as curatorActivitiesT,
  userProfiles as userProfilesT,
  userRoleAssignments as assignmentsT,
  userRoles as rolesT,
} from '@/lib/db/schema';

const MANAGER_ROLES = ['dictionary_admin', 'super_admin'];

async function curatorRoleId() {
  const rows = await db.select({ id: rolesT.id }).from(rolesT).where(eq(rolesT.name, 'curator')).limit(1);
  return rows[0]?.id ?? null;
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: languageId } = await props.params;
  try {
    const { response } = await requireRole(MANAGER_ROLES, languageId);
    if (response) return response;

    const roleId = await curatorRoleId();
    if (!roleId) return NextResponse.json({ error: 'Curator role not found' }, { status: 500 });

    const assignments = await db
      .select({
        id: assignmentsT.id,
        user_id: assignmentsT.userId,
        is_active: assignmentsT.isActive,
        assigned_at: assignmentsT.assignedAt,
      })
      .from(assignmentsT)
      .where(and(eq(assignmentsT.languageId, languageId), eq(assignmentsT.roleId, roleId)));

    const userIds = assignments.map(({ user_id: id }) => id).filter((id): id is string => Boolean(id));
    const profiles = userIds.length
      ? await db
          .select({ user_id: userProfilesT.userId, email: userProfilesT.email, display_name: userProfilesT.displayName, username: userProfilesT.username })
          .from(userProfilesT)
          .where(inArray(userProfilesT.userId, userIds))
      : [];
    const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));

    return NextResponse.json(assignments.map((assignment) => ({
      ...assignment,
      email: assignment.user_id ? profileByUser.get(assignment.user_id)?.email ?? null : null,
      display_name: assignment.user_id ? profileByUser.get(assignment.user_id)?.display_name ?? null : null,
      username: assignment.user_id ? profileByUser.get(assignment.user_id)?.username ?? null : null,
    })));
  } catch (error) {
    console.error('Failed to fetch language curators:', error);
    return NextResponse.json({ error: 'Failed to fetch language curators' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: languageId } = await props.params;
  try {
    const { user, response } = await requireRole(MANAGER_ROLES, languageId);
    if (response) return response;

    const body = (await request.json().catch(() => ({}))) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    const profileRows = await db
      .select({ userId: userProfilesT.userId })
      .from(userProfilesT)
      .where(sql`lower(${userProfilesT.email}) = ${email}`)
      .limit(1);
    const userId = profileRows[0]?.userId;
    if (!userId) return NextResponse.json({ error: 'No Mob Translate account uses that email' }, { status: 404 });

    const roleId = await curatorRoleId();
    if (!roleId) return NextResponse.json({ error: 'Curator role not found' }, { status: 500 });

    const existingRows = await db
      .select()
      .from(assignmentsT)
      .where(and(
        eq(assignmentsT.userId, userId),
        eq(assignmentsT.roleId, roleId),
        eq(assignmentsT.languageId, languageId),
      ))
      .limit(1);
    const existing = existingRows[0];
    if (existing?.isActive) {
      return NextResponse.json({ assignment: snakeRow(existing), alreadyActive: true });
    }
    const now = new Date().toISOString();
    const [assignment] = existing
      ? await db
          .update(assignmentsT)
          .set({ isActive: true, assignedBy: user!.id, assignedAt: now, expiresAt: null })
          .where(eq(assignmentsT.id, existing.id))
          .returning()
      : await db
          .insert(assignmentsT)
          .values({ userId, roleId, languageId, assignedBy: user!.id, isActive: true })
          .returning();

    await db.insert(curatorActivitiesT).values({
      userId: user!.id,
      languageId,
      activityType: existing ? 'curator_access_restored' : 'curator_assigned',
      targetType: 'role_assignment',
      targetId: assignment.id,
      activityData: { assigned_user_id: userId, role: 'curator' },
    });

    return NextResponse.json({ assignment: snakeRow(assignment) }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error('Failed to assign language curator:', error);
    return NextResponse.json({ error: 'Failed to assign language curator' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: languageId } = await props.params;
  try {
    const { user, response } = await requireRole(MANAGER_ROLES, languageId);
    if (response) return response;

    const assignmentId = new URL(request.url).searchParams.get('assignmentId');
    if (!assignmentId) return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });

    const rows = await db
      .select({ id: assignmentsT.id, userId: assignmentsT.userId, isActive: assignmentsT.isActive })
      .from(assignmentsT)
      .where(and(eq(assignmentsT.id, assignmentId), eq(assignmentsT.languageId, languageId)))
      .limit(1);
    const assignment = rows[0];
    if (!assignment) return NextResponse.json({ error: 'Curator assignment not found' }, { status: 404 });

    if (assignment.isActive) {
      await db.update(assignmentsT).set({ isActive: false }).where(eq(assignmentsT.id, assignmentId));
      await db.insert(curatorActivitiesT).values({
        userId: user!.id,
        languageId,
        activityType: 'curator_access_removed',
        targetType: 'role_assignment',
        targetId: assignmentId,
        activityData: { assigned_user_id: assignment.userId, role: 'curator' },
      });
    }

    return NextResponse.json({ success: true, assignmentId, active: false });
  } catch (error) {
    console.error('Failed to remove language curator access:', error);
    return NextResponse.json({ error: 'Failed to remove language curator access' }, { status: 500 });
  }
}
