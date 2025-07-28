import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const assignRoleSchema = z.object({
  role_id: z.string().uuid(),
  language_id: z.string().uuid().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable()
});

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { userId } = params;
  const supabase = createClient();
  
  try {
    // Check if user is admin
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
        role_names: ['super_admin', 'dictionary_admin']
      });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { role_id, language_id, expires_at } = assignRoleSchema.parse(body);

    // Get the role to check permissions
    const { data: role } = await supabase
      .from('user_roles')
      .select('name')
      .eq('id', role_id)
      .single();

    if (!role) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      );
    }

    // Dictionary admins can't assign super_admin or dictionary_admin roles
    const { data: isDictionaryAdmin } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['dictionary_admin']
      });

    if (isDictionaryAdmin && ['super_admin', 'dictionary_admin'].includes(role.name)) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot assign admin roles' },
        { status: 403 }
      );
    }

    // Check if assignment already exists
    const { data: existingAssignment } = await supabase
      .from('user_role_assignments')
      .select('id')
      .eq('user_id', userId)
      .eq('role_id', role_id)
      .eq('language_id', language_id || null)
      .single();

    if (existingAssignment) {
      // Update existing assignment
      const { data: updated, error: updateError } = await supabase
        .from('user_role_assignments')
        .update({
          is_active: true,
          expires_at,
          assigned_by: user.id,
          assigned_at: new Date().toISOString()
        })
        .eq('id', existingAssignment.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return NextResponse.json(updated);
    } else {
      // Create new assignment
      const { data: assignment, error } = await supabase
        .from('user_role_assignments')
        .insert({
          user_id: userId,
          role_id,
          language_id,
          assigned_by: user.id,
          expires_at
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(assignment, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
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