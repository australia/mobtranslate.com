import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get('language');

  try {
    // Execute a database function to get stats
    const r: any = await db.execute(
      sql`select public.get_user_stats(${user!.id}::uuid, ${languageCode}) as data`
    );
    const rows = Array.isArray(r) ? r : r.rows;
    const data = rows?.[0]?.data;

    return NextResponse.json(data);
  } catch (error) {
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
}
