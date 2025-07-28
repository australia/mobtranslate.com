import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's highest role (global first, then any language-specific)
    const { data: roleData } = await supabase
      .rpc('get_user_language_role', {
        user_uuid: user.id,
        lang_id: null // Get global role
      });

    return NextResponse.json({ 
      role: roleData || 'user',
      userId: user.id 
    });
  } catch (error) {
    console.error('Error fetching user role:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user role' },
      { status: 500 }
    );
  }
}