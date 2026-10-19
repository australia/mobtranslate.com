'use client';
import { useRef, useState, type MouseEvent } from 'react';
import { Button, DirectionProvider, Input, NavigationMenu, NavigationMenuContent, NavigationMenuIcon, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuPopup, NavigationMenuPortal, NavigationMenuPositioner, NavigationMenuTrigger, NavigationMenuViewport } from '@mobtranslate/ui';

export function NavigationDestinationsExample() {
  const [value, setValue] = useState<string | null>(null);
  const [vertical, setVertical] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [draft, setDraft] = useState('English-only local navigation draft');
  const overview = useRef<HTMLHeadingElement>(null);
  const details = useRef<HTMLHeadingElement>(null);
  const arriving = useRef<HTMLElement | null>(null);
  const direction = rtl ? 'rtl' : 'ltr';
  function arrive(event: MouseEvent<HTMLAnchorElement>, target: HTMLElement | null) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented) arriving.current = target;
  }
  return <div data-destination-lab className="space-y-4">
    <label htmlFor="destination-local-draft" className="block">Local navigation draft</label>
    <Input id="destination-local-draft" value={draft} onChange={event => setDraft(event.target.value)} aria-describedby="destination-draft-help" />
    <p id="destination-draft-help">Opening panels and same-page destinations retain this text. A full route navigation or reload leaves this page-local draft; no save occurs.</p>
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" aria-pressed={vertical} onClick={() => { setValue(null); setVertical(current => !current); }}>Use vertical local navigation</Button><Button type="button" variant="outline" aria-pressed={rtl} onClick={() => { setValue(null); setRtl(current => !current); }}>Use RTL local navigation</Button></div>
    <DirectionProvider direction={direction}><div dir={direction}>
      <NavigationMenu aria-label="Local destination navigation" value={value} onValueChange={setValue} orientation={vertical ? 'vertical' : 'horizontal'} onOpenChangeComplete={open => { if (!open) { const target = arriving.current; arriving.current = null; target?.focus({preventScroll:true}); } }} className={state => state.open ? 'local-destinations-open' : undefined}>
        <NavigationMenuList>
          <NavigationMenuItem value="local"><NavigationMenuTrigger data-destination-trigger>Local destinations <NavigationMenuIcon /></NavigationMenuTrigger><NavigationMenuContent aria-label="Local destination links">
            <NavigationMenuLink href="#navigation-local-overview" closeOnClick onClick={event => arrive(event, overview.current)}>Read local overview</NavigationMenuLink>
            <NavigationMenuLink href="#navigation-local-details" closeOnClick onClick={event => arrive(event, details.current)}>Read local details</NavigationMenuLink>
          </NavigationMenuContent></NavigationMenuItem>
          <NavigationMenuItem value="guides"><NavigationMenuTrigger>Related guides <NavigationMenuIcon /></NavigationMenuTrigger><NavigationMenuContent aria-label="Related guide links">
            <NavigationMenuLink href="/components/tabs" closeOnClick>View tabs guide</NavigationMenuLink>
            <NavigationMenuLink href="/patterns/navigation" closeOnClick>View navigation patterns</NavigationMenuLink>
          </NavigationMenuContent></NavigationMenuItem>
          <NavigationMenuItem value="unavailable"><NavigationMenuTrigger disabled>Source collection unavailable</NavigationMenuTrigger><NavigationMenuContent><p>Unexpected unavailable navigation activation.</p></NavigationMenuContent></NavigationMenuItem>
          <NavigationMenuItem><NavigationMenuLink href="/components/navigation-menu" active>Current navigation guide</NavigationMenuLink></NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuPortal><NavigationMenuPositioner sideOffset={8} align="start" collisionPadding={8}><NavigationMenuPopup aria-label="Expanded destination navigation" dir={direction}><NavigationMenuViewport /></NavigationMenuPopup></NavigationMenuPositioner></NavigationMenuPortal>
      </NavigationMenu>
    </div></DirectionProvider>
    <p role="status">Open local navigation group: {value ?? 'none'}. Destination availability does not establish source permission.</p>
    <div className="space-y-3"><h3 id="navigation-local-overview" ref={overview} tabIndex={-1} className="font-semibold">Local overview destination</h3><p>Actual same-page overview content. The retained draft is: {draft || '(empty)'}.</p><h3 id="navigation-local-details" ref={details} tabIndex={-1} className="font-semibold">Local details destination</h3><p>Actual same-page details content. No remote collection was fetched or reviewed.</p></div>
    <Button type="button" variant="outline" onClick={() => { setValue(null); setVertical(false); setRtl(false); }}>Restore local navigation layout</Button>
  </div>;
}
