import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/index';
import { requireRole, userHasRole } from '@/lib/auth-helpers';
import { snakeRow } from '@/lib/db/case';
import { userRoleAssignments as uraT, userRoles as userRolesT } from '@/lib/db/schema';

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
    const { user, response } = await requireRole(['super_admin', 'dictionary_admin']);
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

    // Dictionary admins can't assign super_admin or dictionary_admin roles
    const isDictionaryAdmin = await userHasRole(user!.id, ['dictionary_admin']);

    if (isDictionaryAdmin && ['super_admin', 'dictionary_admin'].includes(role.name)) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot assign admin roles' },
        { status: 403 }
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
