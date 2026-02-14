import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  display_name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.record(z.boolean()).optional()
});

export async function GET(_request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check if user is super admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: isAdmin } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['super_admin']
      });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Get all roles
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch roles' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check if user is super admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: isAdmin } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['super_admin']
      });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createRoleSchema.parse(body);

    // Create role
    const { data: role, error } = await supabase
      .from('user_roles')
      .insert({
        ...validatedData,
        permissions: validatedData.permissions || {}
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
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