import { Mic } from 'lucide-react';
import { resolveInvite } from '@/lib/recording/public';
import { PortalApp } from './PortalApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Record your language',
  robots: { index: false, follow: false }, // private invite links — keep out of search
};

export default async function RecordPortalPage({ params }: { params: { token: string } }) {
  const ctx = await resolveInvite(params.token);

  if (!ctx) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Mic className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">This link isn’t active</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          This recording link is not valid or has been turned off. Please ask for a new link.
        </p>
      </div>
    );
  }

  return <PortalApp token={params.token} ctx={ctx} />;
}
