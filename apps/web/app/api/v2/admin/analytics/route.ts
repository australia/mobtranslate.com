import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];
const DAY = 86_400_000;

function monthKey(iso: string | null): string | null {
  return iso ? iso.slice(0, 7) : null;
}

/** Last N month keys, oldest first, e.g. ["2025-07", ...]. */
function lastMonths(n: number, now: Date): string[] {
  const out: string[] = [];
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(base);
    m.setUTCMonth(base.getUTCMonth() - i);
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

const BUCKET_LABELS: Record<number, string> = {
  0: 'New', 1: 'Seen once', 2: 'Learning', 3: 'Familiar', 4: 'Strong', 5: 'Mastered',
};

export async function GET() {
  try {
    // Gate on an admin role using the caller's own session.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_names: ADMIN_ROLES,
    });
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Platform-wide aggregates must read every user's rows, so use the
    // service-role client (RLS would otherwise scope reads to the admin).
    const db = createAdminClient();
    const now = new Date();
    const cutoff30 = new Date(now.getTime() - 30 * DAY).toISOString();

    const [
      { count: totalWords },
      { data: languages },
      { data: profiles },
      { data: attempts },
      { data: srs },
      { data: sessions },
    ] = await Promise.all([
      db.from('words').select('*', { count: 'exact', head: true }),
      db.from('languages').select('id, name, code').eq('is_active', true),
      db.from('user_profiles').select('user_id, display_name, username, created_at'),
      db.from('quiz_attempts').select('user_id, is_correct, created_at'),
      db.from('spaced_repetition_states').select('user_id, bucket'),
      db.from('quiz_sessions').select('user_id, language_id, created_at'),
    ]);

    const profileList = profiles ?? [];
    const attemptList = attempts ?? [];
    const srsList = srs ?? [];
    const sessionList = sessions ?? [];
    const langList = languages ?? [];

    // --- Headline totals ---
    const quizCorrect = attemptList.filter((a) => a.is_correct).length;
    const quizAccuracy = attemptList.length ? Math.round((quizCorrect / attemptList.length) * 100) : 0;

    const learnerIds = new Set<string>();
    attemptList.forEach((a) => a.user_id && learnerIds.add(a.user_id));
    srsList.forEach((s) => s.user_id && learnerIds.add(s.user_id));
    sessionList.forEach((s) => s.user_id && learnerIds.add(s.user_id));

    // --- Monthly timeseries (last 12 months) ---
    const months = lastMonths(12, now);
    const blank = (): Record<string, number> => Object.fromEntries(months.map((m) => [m, 0]));
    const signups = blank();
    profileList.forEach((p) => { const k = monthKey(p.created_at); if (k && k in signups) signups[k]++; });
    const quizByMonth = blank();
    attemptList.forEach((a) => { const k = monthKey(a.created_at); if (k && k in quizByMonth) quizByMonth[k]++; });
    const fmtMonth = (m: string) =>
      new Date(m + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

    // --- Learning progress funnel (spaced-repetition buckets) ---
    const bucketCounts: Record<number, number> = {};
    srsList.forEach((s) => { bucketCounts[s.bucket] = (bucketCounts[s.bucket] ?? 0) + 1; });
    const learningBuckets = Object.keys(BUCKET_LABELS).map((k) => ({
      bucket: Number(k),
      label: BUCKET_LABELS[Number(k)],
      count: bucketCounts[Number(k)] ?? 0,
    }));

    // --- Per language ---
    const wordsByLang = await Promise.all(
      langList.map(async (l) => {
        const { count } = await db.from('words').select('*', { count: 'exact', head: true }).eq('language_id', l.id);
        return [l.id, count ?? 0] as [string, number];
      })
    );
    const wordCountMap = Object.fromEntries(wordsByLang);
    const perLanguage = langList
      .map((l) => {
        const langSessions = sessionList.filter((s) => s.language_id === l.id);
        return {
          name: l.name,
          code: l.code,
          words: wordCountMap[l.id] ?? 0,
          learners: new Set(langSessions.map((s) => s.user_id).filter(Boolean)).size,
          sessions: langSessions.length,
        };
      })
      .sort((a, b) => b.words - a.words);

    // --- Top learners ---
    const nameById = new Map(profileList.map((p) => [p.user_id, p.display_name || p.username || 'Learner']));
    const perLearner = new Map<string, { attempts: number; correct: number }>();
    attemptList.forEach((a) => {
      if (!a.user_id) return;
      const e = perLearner.get(a.user_id) ?? { attempts: 0, correct: 0 };
      e.attempts++;
      if (a.is_correct) e.correct++;
      perLearner.set(a.user_id, e);
    });
    const topLearners = [...perLearner.entries()]
      .map(([id, e]) => ({
        name: nameById.get(id) || 'Learner',
        attempts: e.attempts,
        accuracy: e.attempts ? Math.round((e.correct / e.attempts) * 100) : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 8);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      totals: {
        users: profileList.length,
        activeLearners: learnerIds.size,
        quizAttempts: attemptList.length,
        quizAccuracy,
        wordsInLearning: srsList.length,
        words: totalWords ?? 0,
        languages: langList.length,
        sessions: sessionList.length,
      },
      recent: {
        newUsers30d: profileList.filter((p) => p.created_at && p.created_at >= cutoff30).length,
        attempts30d: attemptList.filter((a) => a.created_at && a.created_at >= cutoff30).length,
        sessions30d: sessionList.filter((s) => s.created_at && s.created_at >= cutoff30).length,
      },
      signupsByMonth: months.map((m) => ({ label: fmtMonth(m), count: signups[m] })),
      quizByMonth: months.map((m) => ({ label: fmtMonth(m), count: quizByMonth[m] })),
      learningBuckets,
      perLanguage,
      topLearners,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
