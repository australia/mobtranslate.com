import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { snakeRow } from '@/lib/db/case';
import { curatorActivities as activitiesT, userRoleAssignments as uraT, userRoles as userRolesT } from '@/lib/db/schema';

const assignRoleSchema = z.object({
  role_id: z.string().uuid(),
  language_id: z.string().uuid().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable()
});

export async function POST(request: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const { userId } = params;

  try {
    // Authz in code (RLS is gone): admin role required.
    const { user, response } = await requireRole(['super_admin']);
    if (response) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      return response;
    }

    // Parse and validate request body
    const body = await request.json();
    const { role_id, language_id, expires_at } = assignRoleSchema.parse(body);

    // Get the role to check permissions
    const roleRows = await db
      .select({ name: userRolesT.name })
      .from(userRolesT)
      .where(eq(userRolesT.id, role_id))
      .limit(1);
    const role = roleRows[0];

    if (!role) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      );
    }

    if (role.name === 'super_admin' && language_id) {
      return NextResponse.json(
        { error: 'Super admin is a platform-wide role and cannot be language-scoped' },
        { status: 400 }
      );
    }

    if (role.name !== 'super_admin' && !language_id) {
      return NextResponse.json(
        { error: 'A language is required for this role' },
        { status: 400 }
      );
    }

    // Check if assignment already exists (language_id may be null).
    const existingRows = await db
      .select({ id: uraT.id })
      .from(uraT)
      .where(
        and(
          eq(uraT.userId, userId),
          eq(uraT.roleId, role_id),
          language_id ? eq(uraT.languageId, language_id) : isNull(uraT.languageId)
        )
      )
      .limit(1);
    const existingAssignment = existingRows[0];

    if (existingAssignment) {
      // Update existing assignment
      const [updated] = await db
        .update(uraT)
        .set({
          isActive: true,
          expiresAt: expires_at ?? null,
          assignedBy: user!.id,
          assignedAt: new Date().toISOString(),
        })
        .where(eq(uraT.id, existingAssignment.id))
        .returning();

      await db.insert(activitiesT).values({
        userId: user!.id,
        languageId: language_id ?? null,
        activityType: 'user_role_assigned',
        targetType: 'role_assignment',
        targetId: updated.id,
        activityData: { assigned_user_id: userId, role: role.name, restored: true },
      });
      return NextResponse.json(snakeRow(updated));
    } else {
      // Create new assignment
      const [assignment] = await db
        .insert(uraT)
        .values({
          userId,
          roleId: role_id,
          languageId: language_id ?? null,
          assignedBy: user!.id,
          expiresAt: expires_at ?? null,
        })
        .returning();

      await db.insert(activitiesT).values({
        userId: user!.id,
        languageId: language_id ?? null,
        activityType: 'user_role_assigned',
        targetType: 'role_assignment',
        targetId: assignment.id,
        activityData: { assigned_user_id: userId, role: role.name, restored: false },
      });
      return NextResponse.json(snakeRow(assignment), { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error assigning role:', error);
    return NextResponse.json(
      { error: 'Failed to assign role' },
      { status: 500 }
    );
  }
}
