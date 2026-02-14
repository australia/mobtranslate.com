import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
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

    // Fetch all user profiles with auth data
    // Since we can't access auth.admin.listUsers() without service role key,
    // we'll fetch from user_profiles which has all registered users
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profileError) {
      console.error('Error fetching user profiles:', profileError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

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

    // Get auth user emails by fetching from auth.users via RPC function
    const { data: authEmails } = await supabase.rpc('get_auth_user_emails');

    // Combine profiles with roles and auth emails
    const users = profiles?.map(profile => {
      const userAssignments = assignments?.filter(a => a.user_id === profile.user_id) || [];
      const authEmail = authEmails?.find((ae: any) => ae.id === profile.user_id);
      
      return {
        id: profile.user_id,
        email: authEmail?.email || profile.email || '',
        display_name: profile.display_name || '',
        username: profile.username || '',
        created_at: profile.created_at,
        last_sign_in_at: authEmail?.last_sign_in_at,
        email_confirmed_at: authEmail?.email_confirmed_at,
        roles: userAssignments.map(a => {
          const ur = a.user_roles as any;
          return {
            role: {
              id: ur.id,
              name: ur.name,
              display_name: ur.display_name
            },
            language: a.languages,
            assigned_at: a.assigned_at,
            expires_at: a.expires_at
          };
        })
      };
    }) || [];

    return NextResponse.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}