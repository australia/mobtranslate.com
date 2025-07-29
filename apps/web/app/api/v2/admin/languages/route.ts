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
    const { data: isAdmin } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['super_admin', 'dictionary_admin']
      });

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch languages with stats
    const { data: languages, error } = await supabase
      .from('languages')
      .select(`
        *,
        dictionary_words!language_id(count),
        user_role_assignments!language_id(count)
      `)
      .order('name');

    if (error) throw error;

    // Transform the data to include counts
    const languagesWithStats = languages?.map(lang => ({
      id: lang.id,
      name: lang.name,
      code: lang.code,
      is_active: lang.is_active,
      created_at: lang.created_at,
      word_count: lang.dictionary_words?.[0]?.count || 0,
      curator_count: lang.user_role_assignments?.[0]?.count || 0
    })) || [];

    return NextResponse.json(languagesWithStats);
  } catch (error) {
    console.error('Failed to fetch languages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch languages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    const { name, code, is_active } = body;

    // Validate input
    if (!name || !code) {
      return NextResponse.json(
        { error: 'Name and code are required' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const { data: existingLang } = await supabase
      .from('languages')
      .select('id')
      .eq('code', code)
      .single();

    if (existingLang) {
      return NextResponse.json(
        { error: 'Language code already exists' },
        { status: 400 }
      );
    }

    // Create new language
    const { data: newLanguage, error } = await supabase
      .from('languages')
      .insert({
        name,
        code: code.toLowerCase(),
        is_active: is_active ?? true
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(newLanguage);
  } catch (error) {
    console.error('Failed to create language:', error);
    return NextResponse.json(
      { error: 'Failed to create language' },
      { status: 500 }
    );
  }
}