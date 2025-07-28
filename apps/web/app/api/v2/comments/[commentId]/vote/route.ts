import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const voteSchema = z.object({
  vote_type: z.enum(['up', 'down'])
});

export async function POST(
  request: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const { commentId } = params;
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
    const { vote_type } = voteSchema.parse(body);

    // Check if user already voted
    const { data: existingVote } = await supabase
      .from('comment_votes')
      .select('*')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .single();

    if (existingVote) {
      if (existingVote.vote_type === vote_type) {
        // Remove vote if clicking the same vote type
        const { error: deleteError } = await supabase
          .from('comment_votes')
          .delete()
          .eq('id', existingVote.id);

        if (deleteError) throw deleteError;

        return NextResponse.json({ message: 'Vote removed' });
      } else {
        // Update vote type
        const { error: updateError } = await supabase
          .from('comment_votes')
          .update({ vote_type })
          .eq('id', existingVote.id);

        if (updateError) throw updateError;

        return NextResponse.json({ message: 'Vote updated' });
      }
    } else {
      // Create new vote
      const { error: insertError } = await supabase
        .from('comment_votes')
        .insert({
          comment_id: commentId,
          user_id: user.id,
          vote_type
        });

      if (insertError) throw insertError;

      return NextResponse.json({ message: 'Vote recorded' }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error voting on comment:', error);
    return NextResponse.json(
      { error: 'Failed to record vote' },
      { status: 500 }
    );
  }
}