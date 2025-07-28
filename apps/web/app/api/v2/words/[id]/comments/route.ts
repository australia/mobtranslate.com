import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createCommentSchema = z.object({
  comment_text: z.string().min(1).max(5000),
  comment_type: z.enum(['general', 'pronunciation', 'usage', 'cultural', 'grammar']).optional(),
  parent_id: z.string().uuid().optional()
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: wordId } = params;
  const supabase = createClient();
  
  try {
    // Get comments with user info and vote counts
    const { data: comments, error } = await supabase
      .from('word_comments')
      .select(`
        *,
        user:profiles!user_id(
          id,
          display_name,
          avatar_url
        ),
        replies:word_comments!parent_id(count)
      `)
      .eq('word_id', wordId)
      .is('parent_id', null) // Get only top-level comments
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      (comments || []).map(async (comment) => {
        const { data: replies } = await supabase
          .from('word_comments')
          .select(`
            *,
            user:profiles!user_id(
              id,
              display_name,
              avatar_url
            )
          `)
          .eq('parent_id', comment.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true });

        return {
          ...comment,
          replies: replies || []
        };
      })
    );

    return NextResponse.json(commentsWithReplies);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: wordId } = params;
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createCommentSchema.parse(body);

    // Create comment
    const { data: comment, error } = await supabase
      .from('word_comments')
      .insert({
        word_id: wordId,
        user_id: user.id,
        ...validatedData
      })
      .select(`
        *,
        user:profiles!user_id(
          id,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}