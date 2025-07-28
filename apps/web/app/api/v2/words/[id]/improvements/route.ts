import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createImprovementSchema = z.object({
  improvement_type: z.enum(['definition', 'translation', 'example', 'pronunciation', 'grammar', 'cultural_context']),
  field_name: z.string().optional(),
  current_value: z.any().optional(),
  suggested_value: z.any(),
  improvement_reason: z.string().optional(),
  supporting_references: z.array(z.string()).optional()
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: wordId } = params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  
  const supabase = createClient();
  
  try {
    let query = supabase
      .from('word_improvement_suggestions')
      .select(`
        *,
        submitted_by_user:profiles!submitted_by(
          id,
          display_name,
          avatar_url
        ),
        reviewed_by_user:profiles!reviewed_by(
          id,
          display_name,
          avatar_url
        ),
        votes:improvement_votes(
          vote,
          voter:profiles!voter_id(
            id,
            display_name
          )
        )
      `)
      .eq('word_id', wordId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: improvements, error } = await query;

    if (error) throw error;

    // Calculate vote summary for each improvement
    const improvementsWithVoteSummary = (improvements || []).map(improvement => {
      const voteSummary = {
        approve: 0,
        reject: 0,
        needs_work: 0
      };
      
      improvement.votes?.forEach((vote: any) => {
        voteSummary[vote.vote as keyof typeof voteSummary]++;
      });

      return {
        ...improvement,
        vote_summary: voteSummary
      };
    });

    return NextResponse.json(improvementsWithVoteSummary);
  } catch (error) {
    console.error('Error fetching improvements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch improvements' },
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
    const validatedData = createImprovementSchema.parse(body);

    // Get current word data if current_value not provided
    if (!validatedData.current_value && validatedData.field_name) {
      const { data: word } = await supabase
        .from('words')
        .select('*')
        .eq('id', wordId)
        .single();
      
      if (word && validatedData.field_name in word) {
        validatedData.current_value = word[validatedData.field_name];
      }
    }

    // Create improvement suggestion
    const { data: improvement, error } = await supabase
      .from('word_improvement_suggestions')
      .insert({
        word_id: wordId,
        submitted_by: user.id,
        ...validatedData,
        confidence_score: 0.5 // Default confidence, can be calculated based on user reputation
      })
      .select(`
        *,
        submitted_by_user:profiles!submitted_by(
          id,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(improvement, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error creating improvement suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to create improvement suggestion' },
      { status: 500 }
    );
  }
}