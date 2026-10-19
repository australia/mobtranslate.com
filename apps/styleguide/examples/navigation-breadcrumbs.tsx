'use client';
import { useState } from 'react';
import { BreadcrumbLink, BreadcrumbPage, Breadcrumbs, Button } from '@mobtranslate/ui';

export function BreadcrumbNavigationExample() {
  const [rtl, setRtl] = useState(false);
  const [custom, setCustom] = useState(false);
  const [long, setLong] = useState(false);
  return <div data-breadcrumb-lab className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" aria-pressed={rtl} onClick={() => setRtl(current => !current)}>Use RTL local breadcrumbs</Button><Button type="button" variant="outline" aria-pressed={custom} onClick={() => setCustom(current => !current)}>Use slash breadcrumb separator</Button><Button type="button" variant="outline" aria-pressed={long} onClick={() => setLong(current => !current)}>Use long breadcrumb labels</Button></div>
    <div dir={rtl ? 'rtl' : 'ltr'}><Breadcrumbs aria-label="Navigation documentation path" separator={custom ? '/' : undefined}>
      <BreadcrumbLink href="/">{long ? 'MobTranslate design system and implementation guidance home' : 'Design system home'}</BreadcrumbLink>
      <BreadcrumbLink href="/patterns/navigation">{long ? 'Navigation and related task-view patterns' : 'Navigation patterns'}</BreadcrumbLink>
      <BreadcrumbPage>Breadcrumbs</BreadcrumbPage>
    </Breadcrumbs></div>
    <p>This authored documentation path uses real ancestors and the current guide. It is independent of browsing history and does not grant source access or authority.</p>
  </div>;
}
