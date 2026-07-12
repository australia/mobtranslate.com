import Link from 'next/link';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, EXPORT_ROLES } from '@/lib/recording/sentence-studio';
import StudioDashboard from './StudioDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Recording Studio Dashboard · Kuku Yalanji',
  description: 'Corpus progress, speakers, elder corrections, and exports.',
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-50 p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-3">Sign in required</h1>
          <Link href="/auth/signin?redirect=/record/dashboard" className="text-emerald-700 underline">Sign in</Link>
        </div>
      </main>
    );
  }
  const ok = await userHasRole(user.id, STUDIO_ROLES);
  if (!ok) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-50 p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-3">Curator access needed</h1>
          <Link href="/" className="text-stone-600 underline">Back to home</Link>
        </div>
      </main>
    );
  }
  const canExport = await userHasRole(user.id, EXPORT_ROLES);
  return <StudioDashboard canExport={canExport} />;
}
