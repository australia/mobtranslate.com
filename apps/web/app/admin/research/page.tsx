import Link from 'next/link';
import { ArrowRight, Image as ImageIcon, LockKeyhole, Map as MapIcon, Sprout } from 'lucide-react';
import { requireResearchAdminPage } from '@/lib/research/access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Research' };

const tools = [
  {
    title: 'Quinkan discovery atlas',
    href: '/admin/research/quinkan',
    icon: MapIcon,
    description:
      'The Laura–Quinkan operational map: environmental layers, survey-priority proposals, field reports, datasets, algorithms and calibration.',
    note: 'Proposals are an unlabelled geomorphic survey-priority baseline, not cave or artwork predictions.',
  },
  {
    title: 'Private field workspace',
    href: '/admin/research/quinkan/private',
    icon: LockKeyhole,
    description:
      'Restricted subterranean-GDE release and The Cathedral place-hypothesis report, verified against their immutable hashes on every request.',
    note: 'Requires a verified email on the workspace access policy as well as super admin.',
  },
  {
    title: 'Field models',
    href: '/admin/research/field/targets',
    icon: Sprout,
    description:
      'Log yams and other finds on foot with the phone’s GPS (works offline), then fit suitability models against national terrain, water, soil, fire, vegetation and climate layers.',
    note: 'Prototype area: Kalinga Station. Finds are restricted knowledge and stay in this database.',
  },
  {
    title: 'Rock art workbench',
    href: '/admin/research/rock-art',
    icon: ImageIcon,
    description:
      'Decorrelation stretch, channel arithmetic and comparison for rock-art photography, plus palimpsest figure decomposition and completion.',
    note: 'Image enhancement runs in the browser; palimpsest requests go only to this server’s local model.',
  },
] as const;

export default async function ResearchPage() {
  await requireResearchAdminPage();
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Research</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Field research instruments for the Laura–Quinkan program. Every page here is super admin only, never cached
          or indexed, and runs without analytics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-lg font-semibold">{tool.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{tool.description}</p>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{tool.note}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>

      <p className="max-w-3xl border-l-2 border-primary/40 pl-4 text-sm text-muted-foreground">
        Traditional Owners are the governing authority for cultural interpretation, known-place data, candidate
        disclosure and field access. A proposal is not a discovery and is not permission to enter Country.
      </p>
    </div>
  );
}
