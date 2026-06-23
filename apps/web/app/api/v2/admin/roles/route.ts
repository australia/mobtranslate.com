import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/index';
import { snakeRow, snakeRows } from '@/lib/db/case';
import { requireRole } from '@/lib/auth-helpers';
import { userRoles as userRolesT } from '@/lib/db/schema';

const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  display_name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional()
});

export async function GET(_request: NextRequest) {
  try {
    // Only super admins may view roles.
    const { response } = await requireRole(['super_admin']);
    if (response) {
      // Preserve the original "Admin access required" message on 403.
      if (response.status === 403) {
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      return response;
    }

    const roles = await db
      .select()
      .from(userRolesT)
      .orderBy(asc(userRolesT.createdAt));

    return NextResponse.json(snakeRows(roles));
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch roles' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only super admins may create roles.
    const { response } = await requireRole(['super_admin']);
    if (response) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      return response;
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createRoleSchema.parse(body);

    const [role] = await db
      .insert(userRolesT)
      .values({
        name: validatedData.name,
        displayName: validatedData.display_name,
        description: validatedData.description ?? null,
        permissions: validatedData.permissions || {},
      })
      .returning();

    return NextResponse.json(snakeRow(role), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating role:', error);
    return NextResponse.json(
      { error: 'Failed to create role' },
      { status: 500 }
    );
  }
}
