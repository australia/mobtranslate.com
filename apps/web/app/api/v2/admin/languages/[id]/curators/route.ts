import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up the curator role dynamically
    const { data: curatorRole, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('name', 'curator')
      .single();

    if (roleError || !curatorRole) {
      console.error('Error fetching curator role:', roleError);
      return NextResponse.json({ error: 'Curator role not found' }, { status: 500 });
    }

    // Fetch curators for this language
    const { data: curatorData, error: curatorError } = await supabase
      .from('user_role_assignments')
      .select(`
        id,
        user_id,
        is_active,
        assigned_at,
        role_id
      `)
      .eq('language_id', params.id)
      .eq('role_id', curatorRole.id);

    if (curatorError) {
      console.error('Error fetching curators:', curatorError);
      return NextResponse.json({ error: curatorError.message }, { status: 400 });
    }

    const curatorAssignments = curatorData || [];

    // Get user emails
    const userIds = curatorAssignments.map(c => c.user_id);
    let userProfiles: any[] = [];
    
    if (userIds.length > 0) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, email')
        .in('user_id', userIds);
      
      if (!error && data) {
        userProfiles = data;
      }
    }

    const formattedCurators = curatorAssignments.map(c => {
      const profile = userProfiles?.find(p => p.user_id === c.user_id);
      return {
        id: c.id,
        user_id: c.user_id,
        email: profile?.email || 'Unknown',
        assigned_at: c.assigned_at,
        is_active: c.is_active
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the current user has an admin role
    const { data: adminAssignments, error: adminCheckError } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['dictionary_admin', 'super_admin']);

    if (adminCheckError || !adminAssignments || adminAssignments.length === 0) {
      return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
    }

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user by email
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found with that email' }, { status: 404 });
    }

    // Look up the curator role dynamically
    const { data: curatorRole, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('name', 'curator')
      .single();

    if (roleError || !curatorRole) {
      return NextResponse.json({ error: 'Curator role not found' }, { status: 500 });
    }

    const curatorRoleId = curatorRole.id;

    // Create the assignment
    const { data: assignment, error: assignError } = await supabase
      .from('user_role_assignments')
      .insert({
        user_id: userData.user_id,
        role_id: curatorRoleId,
        language_id: params.id,
        assigned_by: user.id,
        is_active: true
      })
      .select()
      .single();

    if (assignError) {
      console.error('Assignment error:', assignError);
      
      // Check for duplicate key error
      if (assignError.code === '23505') {
        return NextResponse.json({ 
          error: 'This user is already a curator for this language' 
        }, { status: 400 });
      }
      
      return NextResponse.json({ error: assignError.message }, { status: 400 });
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error('Failed to add curator:', error);
    return NextResponse.json(
      { error: 'Failed to add curator' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the current user has an admin role
    const { data: adminAssignments, error: adminCheckError } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['dictionary_admin', 'super_admin']);

    if (adminCheckError || !adminAssignments || adminAssignments.length === 0) {
      return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('user_role_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('language_id', params.id);

    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove curator:', error);
    return NextResponse.json(
      { error: 'Failed to remove curator' },
      { status: 500 }
    );
  }
}