import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['super_admin', 'dictionary_admin']);

    const isAdmin = roleAssignments && roleAssignments.length > 0;

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all auth users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error fetching auth users:', authError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Fetch all profiles
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*');

    // Fetch role assignments
    const { data: assignments } = await supabase
      .from('user_role_assignments')
      .select(`
        user_id,
        assigned_at,
        expires_at,
        user_roles!inner(
          id,
          name,
          display_name
        ),
        languages(
          id,
          name,
          code
        )
      `)
      .eq('is_active', true);

    // Combine auth users with profiles and roles
    const users = authUsers.users.map(authUser => {
      const profile = profiles?.find(p => p.user_id === authUser.id);
      const userAssignments = assignments?.filter(a => a.user_id === authUser.id) || [];
      
      return {
        id: authUser.id,
        email: authUser.email || '',
        display_name: profile?.display_name || authUser.user_metadata?.username || '',
        username: profile?.username || authUser.user_metadata?.username || '',
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at,
        email_confirmed_at: authUser.email_confirmed_at,
        roles: userAssignments.map(a => ({
          role: {
            id: a.user_roles.id,
            name: a.user_roles.name,
            display_name: a.user_roles.display_name
          },
          language: a.languages,
          assigned_at: a.assigned_at,
          expires_at: a.expires_at
        }))
      };
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}