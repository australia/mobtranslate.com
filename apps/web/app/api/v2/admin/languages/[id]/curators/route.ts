import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser, requireRole } from '@/lib/auth-helpers';
import {
  userProfiles as userProfilesT,
  userRoleAssignments as uraT,
  userRoles as userRolesT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Authentication required.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up the curator role dynamically
    const curatorRoleRows = await db
      .select({ id: userRolesT.id })
      .from(userRolesT)
      .where(eq(userRolesT.name, 'curator'))
      .limit(1);
    const curatorRole = curatorRoleRows[0];

    if (!curatorRole) {
      console.error('Error fetching curator role: not found');
      return NextResponse.json({ error: 'Curator role not found' }, { status: 500 });
    }

    // Fetch curators for this language
    const curatorAssignments = await db
      .select({
        id: uraT.id,
        user_id: uraT.userId,
        is_active: uraT.isActive,
        assigned_at: uraT.assignedAt,
        role_id: uraT.roleId,
      })
      .from(uraT)
      .where(and(eq(uraT.languageId, params.id), eq(uraT.roleId, curatorRole.id)));

    // Get user emails
    const userIds = curatorAssignments
      .map((c) => c.user_id)
      .filter((id): id is string => !!id);
    let userProfiles: Array<{ user_id: string; email: string | null }> = [];

    if (userIds.length > 0) {
      userProfiles = await db
        .select({ user_id: userProfilesT.userId, email: userProfilesT.email })
        .from(userProfilesT)
        .where(inArray(userProfilesT.userId, userIds));
    }

    const formattedCurators = curatorAssignments.map((c) => {
      const profile = userProfiles.find((p) => p.user_id === c.user_id);
      return {
        id: c.id,
        user_id: c.user_id,
        email: profile?.email || 'Unknown',
        assigned_at: c.assigned_at,
        is_active: c.is_active,
      };
    });

    return NextResponse.json(formattedCurators);
  } catch (error) {
    console.error('Failed to fetch curators:', error);
    return NextResponse.json(
      { error: 'Failed to fetch curators' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Authentication required.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the current user has an admin role.
    const { response } = await requireRole(['dictionary_admin', 'super_admin']);
    if (response) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
      }
      return response;
    }

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user by email
    const userRows = await db
      .select({ user_id: userProfilesT.userId })
      .from(userProfilesT)
      .where(eq(userProfilesT.email, email))
      .limit(1);
    const userData = userRows[0];

    if (!userData) {
      return NextResponse.json({ error: 'User not found with that email' }, { status: 404 });
    }

    // Look up the curator role dynamically
    const curatorRoleRows = await db
      .select({ id: userRolesT.id })
      .from(userRolesT)
      .where(eq(userRolesT.name, 'curator'))
      .limit(1);
    const curatorRole = curatorRoleRows[0];

    if (!curatorRole) {
      return NextResponse.json({ error: 'Curator role not found' }, { status: 500 });
    }

    // Create the assignment
    try {
      const [assignment] = await db
        .insert(uraT)
        .values({
          userId: userData.user_id!,
          roleId: curatorRole.id,
          languageId: params.id,
          assignedBy: user.id,
          isActive: true,
        })
        .returning();

      return NextResponse.json(snakeRow(assignment));
    } catch (assignError: any) {
      console.error('Assignment error:', assignError);

      // Check for duplicate key error
      if (assignError?.code === '23505') {
        return NextResponse.json({
          error: 'This user is already a curator for this language'
        }, { status: 400 });
      }

      return NextResponse.json(
        { error: assignError instanceof Error ? assignError.message : 'Failed to add curator' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Failed to add curator:', error);
    return NextResponse.json(
      { error: 'Failed to add curator' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Authentication required.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the current user has an admin role.
    const { response } = await requireRole(['dictionary_admin', 'super_admin']);
    if (response) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
      }
      return response;
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    await db
      .delete(uraT)
      .where(and(eq(uraT.id, assignmentId), eq(uraT.languageId, params.id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove curator:', error);
    return NextResponse.json(
      { error: 'Failed to remove curator' },
      { status: 500 }
    );
  }
}
