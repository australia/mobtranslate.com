import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
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
    const { name, code, is_active } = body;

    // Validate input
    if (!name || !code) {
      return NextResponse.json(
        { error: 'Name and code are required' },
        { status: 400 }
      );
    }

    // First check if the language exists
    const { data: existingLang, error: checkError } = await supabase
      .from('languages')
      .select('id')
      .eq('id', params.id)
      .single();

    if (checkError || !existingLang) {
      console.error('Language not found:', params.id);
      return NextResponse.json(
        { error: 'Language not found' },
        { status: 404 }
      );
    }

    // Update language
    const { data: updatedLanguage, error } = await supabase
      .from('languages')
      .update({
        name,
        code: code.toLowerCase(),
        is_active: is_active ?? true,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      throw error;
    }

    return NextResponse.json(updatedLanguage);
  } catch (error) {
    console.error('Failed to update language:', error);
    return NextResponse.json(
      { error: 'Failed to update language' },
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

    // Only super admin can delete languages
    const { data: isSuperAdmin } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['super_admin']
      });

    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if language has words
    const { count } = await supabase
      .from('dictionary_words')
      .select('*', { count: 'exact', head: true })
      .eq('language_id', params.id);

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete language with existing words' },
        { status: 400 }
      );
    }

    // Delete language
    const { error } = await supabase
      .from('languages')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete language:', error);
    return NextResponse.json(
      { error: 'Failed to delete language' },
      { status: 500 }
    );
  }
}