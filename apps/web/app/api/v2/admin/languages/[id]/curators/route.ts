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
      .eq('language_id', params.id);

    if (curatorError) {
      console.error('Error fetching curators:', curatorError);
      return NextResponse.json({ error: curatorError.message }, { status: 400 });
    }

    // Hardcoded curator role ID
    const curatorRoleId = '18852da6-18c0-4a2a-8fc0-4aa0c544aab5';
    const curatorAssignments = curatorData?.filter(c => c.role_id === curatorRoleId) || [];

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

    // TODO: Add proper admin check without causing recursion
    console.log('Authenticated user:', user.id, user.email);

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

    // TODO: Add proper admin check without causing recursion
    console.log('Authenticated user:', user.id, user.email);

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