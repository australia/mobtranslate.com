import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Check if a word is liked
export async function GET(
  request: NextRequest,
  { params }: { params: { wordId: string } }
) {
  const supabase = createClient();
  const { wordId } = params;

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { data: like, error } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking like:', error);
      return NextResponse.json({ error: 'Failed to check like status' }, { status: 500 });
    }

    return NextResponse.json({ liked: !!like });
  } catch (error) {
    console.error('Like check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Like a word
export async function POST(
  request: NextRequest,
  { params }: { params: { wordId: string } }
) {
  const supabase = createClient();
  const { wordId } = params;

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Check if already liked
    const { data: existingLike } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .maybeSingle();

    if (existingLike) {
      return NextResponse.json({ liked: true, message: 'Already liked' });
    }

    // Create like
    const { error: likeError } = await supabase
      .from('likes')
      .insert({
        user_id: user.id,
        word_id: wordId
      });

    if (likeError) {
      console.error('Error creating like:', likeError);
      return NextResponse.json({ error: 'Failed to like word' }, { status: 500 });
    }

    return NextResponse.json({ liked: true, message: 'Word liked successfully' });
  } catch (error) {
    console.error('Like creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Unlike a word
export async function DELETE(
  request: NextRequest,
  { params }: { params: { wordId: string } }
) {
  const supabase = createClient();
  const { wordId } = params;

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', user.id)
      .eq('word_id', wordId);

    if (deleteError) {
      console.error('Error deleting like:', deleteError);
      return NextResponse.json({ error: 'Failed to unlike word' }, { status: 500 });
    }

    return NextResponse.json({ liked: false, message: 'Word unliked successfully' });
  } catch (error) {
    console.error('Like deletion error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}