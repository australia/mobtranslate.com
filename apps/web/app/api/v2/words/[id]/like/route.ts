import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const wordId = params.id;
  const supabase = createClient();

  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    // Get the user's like status for this word
    const { data, error } = await supabase
      .from('user_word_likes')
      .select('*')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    return NextResponse.json({
      isLiked: !!data,
      isLove: data?.is_love || false,
      likedAt: data?.liked_at || null
    });
  } catch (error) {
    console.error('Error checking like status:', error);
    return NextResponse.json(
      { error: 'Failed to check like status' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const wordId = params.id;
  const supabase = createClient();

  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { isLove = false } = body;

    // Check if word exists
    const { data: word, error: wordError } = await supabase
      .from('words')
      .select('id')
      .eq('id', wordId)
      .single();

    if (wordError || !word) {
      return NextResponse.json(
        { error: 'Word not found' },
        { status: 404 }
      );
    }

    // Insert or update the like
    const { data, error } = await supabase
      .from('user_word_likes')
      .upsert({
        user_id: user.id,
        word_id: wordId,
        is_love: isLove,
        liked_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,word_id'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      like: data
    });
  } catch (error) {
    console.error('Error liking word:', error);
    return NextResponse.json(
      { error: 'Failed to like word' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const wordId = params.id;
  const supabase = createClient();

  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { error } = await supabase
      .from('user_word_likes')
      .delete()
      .eq('user_id', user.id)
      .eq('word_id', wordId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('Error unliking word:', error);
    return NextResponse.json(
      { error: 'Failed to unlike word' },
      { status: 500 }
    );
  }
}