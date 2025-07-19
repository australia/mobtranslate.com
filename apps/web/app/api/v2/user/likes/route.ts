import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const searchParams = request.nextUrl.searchParams;
  
  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const filterLove = searchParams.get('loveOnly') === 'true';

  try {
    // Build query
    let query = supabase
      .from('user_word_likes')
      .select(`
        *,
        word:words(
          *,
          word_class:word_classes(*),
          definitions(
            *,
            translations(*)
          ),
          usage_examples(*),
          language:languages(*)
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('liked_at', { ascending: false });

    // Filter for loves only if requested
    if (filterLove) {
      query = query.eq('is_love', true);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: likes, error, count } = await query;

    if (error) {
      throw error;
    }

    const totalCount = count || 0;

    return NextResponse.json({
      likes: likes || [],
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching user likes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch likes' },
      { status: 500 }
    );
  }
}