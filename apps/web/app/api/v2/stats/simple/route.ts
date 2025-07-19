import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Execute a database function to get stats
    const { data, error } = await supabase.rpc('get_user_stats', {
      p_user_id: user.id
    });

    if (error) {
      console.error('Error fetching stats:', error);
      
      // Fallback to basic stats
      return NextResponse.json({
        overall: {
          totalWords: 0,
          masteredWords: 0,
          dueWords: 0,
          totalAttempts: 0,
          correctAttempts: 0,
          accuracy: 0,
          streakDays: 0
        },
        recent: {
          last7Days: { attempts: 0, correct: 0, accuracy: 0 },
          last30Days: { attempts: 0, correct: 0, accuracy: 0 }
        },
        languages: [],
        recentAttempts: []
      });
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in stats API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}