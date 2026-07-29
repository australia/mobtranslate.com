'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mobtranslate/ui';
import { AlertCircle, CheckCircle, CloudCog, Database, KeyRound, Mail, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal } from 'lucide-react';

type ControlState = 'available' | 'deployment_managed' | 'not_available';
interface ConfigurationResponse {
  configurationMode?: string;
  writable?: boolean;
  runtime?: {
    databaseConfigured?: boolean;
    authenticationSecretConfigured?: boolean;
    transactionalEmailConfigured?: boolean;
  };
  controls?: Array<{ id: string; name: string; state: ControlState; detail: string; href?: string }>;
  error?: string;
}

const stateLabel: Record<ControlState, string> = {
  available: 'Available',
  deployment_managed: 'Deployment-managed',
  not_available: 'Not available',
};

export default function SettingsPage() {
  const [configuration, setConfiguration] = useState<ConfigurationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/v2/admin/settings');
      const data = (await response.json().catch(() => ({}))) as ConfigurationResponse;
      if (!response.ok) throw new Error(data.error || 'Could not inspect system configuration.');
      setConfiguration(data);
    } catch (error) {
      setConfiguration(null);
      setLoadError(error instanceof Error ? error.message : 'Could not inspect system configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">System configuration</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">See what is actually configured, where it is controlled, and which switches do not exist yet.</p>
      </div>

      {loading ? <div className="space-y-3" aria-label="Loading system configuration">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" aria-hidden="true" />)}</div> : loadError ? (
        <Card><CardContent><div className="flex flex-col items-center py-12 text-center"><AlertCircle className="mb-4 h-11 w-11 text-error" /><p className="text-lg font-semibold">Configuration did not load</p><p className="mt-2 text-sm text-muted-foreground">{loadError}</p><Button className="mt-5" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div></CardContent></Card>
      ) : configuration ? <>
        <Card className="border-primary/20 bg-primary/[0.04]"><CardContent className="flex gap-3 py-5"><CloudCog className="mt-0.5 h-6 w-6 shrink-0 text-primary" /><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Configuration is deployment-managed</p><Badge variant="secondary">Read-only</Badge></div><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Security, product identity, infrastructure, and service credentials are changed through reviewed code or deployment configuration. This page reports only controls the application actually uses.</p></div></CardContent></Card>

        <div className="grid gap-4 md:grid-cols-3">
          <RuntimeCard title="Database" configured={configuration.runtime?.databaseConfigured} icon={Database} description="Required for accounts, dictionaries, reviews, and audit history." />
          <RuntimeCard title="Authentication secret" configured={configuration.runtime?.authenticationSecretConfigured} icon={KeyRound} description="Required to sign and protect authenticated sessions." />
          <RuntimeCard title="Transactional email" configured={configuration.runtime?.transactionalEmailConfigured} icon={Mail} description="Used for password-reset delivery; no admin digest system is wired." />
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" />Control map</CardTitle><CardDescription>Each row names the real owner and state of an administrative capability.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(configuration.controls || []).map((control) => (
              <div key={control.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{control.name}</p><ControlBadge state={control.state} /></div><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{control.detail}</p></div>
                {control.href ? <Button asChild variant="outline" size="sm" className="w-fit shrink-0"><Link href={control.href}>Open language controls</Link></Button> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Why this is intentionally read-only</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3"><p><span className="font-medium text-foreground">Reviewable:</span> material behavior changes travel with code and can be tested before deployment.</p><p><span className="font-medium text-foreground">Auditable:</span> language-scoped role changes are stored as explicit activity rather than invisible global switches.</p><p><span className="font-medium text-foreground">Honest:</span> unavailable maintenance, notification, and auto-approval controls are labelled unavailable.</p></CardContent></Card>
      </> : null}
    </div>
  );
}

function RuntimeCard({ title, configured, icon: Icon, description }: { title: string; configured?: boolean; icon: typeof Settings2; description: string }) {
  return <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><div className="rounded-lg bg-muted p-2"><Icon className="h-5 w-5" /></div><Badge variant={configured ? 'primary' : 'error'}>{configured ? 'Configured' : 'Needs configuration'}</Badge></div><CardTitle className="pt-3 text-base">{title}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{description}</p></CardContent></Card>;
}

function ControlBadge({ state }: { state: ControlState }) {
  const icon = state === 'available' ? <CheckCircle className="mr-1 h-3.5 w-3.5" /> : state === 'deployment_managed' ? <CloudCog className="mr-1 h-3.5 w-3.5" /> : <AlertCircle className="mr-1 h-3.5 w-3.5" />;
  return <Badge variant={state === 'available' ? 'primary' : state === 'not_available' ? 'error' : 'secondary'}>{icon}{stateLabel[state]}</Badge>;
}
