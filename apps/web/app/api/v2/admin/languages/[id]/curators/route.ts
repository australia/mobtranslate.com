import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Check if user is admin
    const { data: isAdmin } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['super_admin', 'dictionary_admin']
      });

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    // Hardcoded curator role ID to avoid RLS issues
    const curatorRoleId = '18852da6-18c0-4a2a-8fc0-4aa0c544aab5';

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

    // Check if user is admin
    const { data: isAdmin } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['super_admin', 'dictionary_admin']
      });

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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