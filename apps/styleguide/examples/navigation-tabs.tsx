'use client';
import { useRef, useState, type CSSProperties } from 'react';
const previewActionStyle: CSSProperties = {maxWidth:'100%',whiteSpace:'normal',height:'auto',minHeight:44,paddingBlock:8};
import { Button, DirectionProvider, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@mobtranslate/ui';

export function NavigationTabsExample() {
  const [value, setValue] = useState('draft');
  const [draft, setDraft] = useState('English-only local draft');
  const [automatic, setAutomatic] = useState(false);
  const [vertical, setVertical] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [keepMounted, setKeepMounted] = useState(false);
  const [outcome, setOutcome] = useState<'idle' | 'pending' | 'failed' | 'complete'>('idle');
  const preview = useRef<HTMLDivElement>(null);
  function resolve(next: 'idle' | 'failed' | 'complete') { setOutcome(next); preview.current?.focus(); }
  const direction = rtl ? 'rtl' : 'ltr';
  return <div data-tabs-lab className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" aria-pressed={automatic} onClick={() => setAutomatic(current => !current)}>Activate local tabs on focus</Button>
      <Button type="button" variant="outline" aria-pressed={vertical} onClick={() => setVertical(current => !current)}>Use vertical local tabs</Button>
      <Button type="button" variant="outline" aria-pressed={rtl} onClick={() => setRtl(current => !current)}>Use RTL local tabs</Button>
      <Button type="button" variant="outline" aria-pressed={keepMounted} onClick={() => setKeepMounted(current => !current)}>Keep local panels mounted</Button>
    </div>
    <DirectionProvider direction={direction}><div dir={direction}>
      <Tabs value={value} onValueChange={setValue} orientation={vertical ? 'vertical' : 'horizontal'} className={state => `local-tabs-${state.orientation}`}>
        <TabsList aria-label="Local record views" activateOnFocus={automatic}>
          <TabsTrigger value="draft" className={state => state.active ? 'local-tab-active' : undefined}>Draft</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="remote" disabled>Remote review unavailable</TabsTrigger>
          <TabsTrigger value="history">Local history</TabsTrigger>
        </TabsList>
        <TabsContent value="draft" keepMounted={keepMounted}>
          <label htmlFor="navigation-local-draft" className="block mb-2">Local draft text</label>
          <Input id="navigation-local-draft" value={draft} onChange={event => setDraft(event.target.value)} aria-describedby="navigation-draft-help" />
          <p id="navigation-draft-help">The parent owns this value; switching panels does not discard it.</p>
        </TabsContent>
        <TabsContent value="preview" keepMounted={keepMounted} ref={preview}>
          <p data-tabs-preview>{draft || 'The local draft is empty.'}</p>
          <Button style={previewActionStyle} type="button" disabled={outcome === 'pending'} onClick={() => setOutcome('pending')}>Request local preview check</Button>
          {outcome === 'pending' && <div className="flex flex-wrap gap-3 mt-3"><Button style={previewActionStyle} type="button" onClick={() => resolve('complete')}>Complete local preview check</Button><Button style={previewActionStyle} type="button" variant="outline" onClick={() => resolve('failed')}>Fail local preview check</Button><Button style={previewActionStyle} type="button" variant="outline" onClick={() => resolve('idle')}>Cancel local preview check</Button></div>}
          <p role="status">{outcome === 'pending' ? 'Local check pending; the draft remains available.' : outcome === 'failed' ? 'Local check failed; retained text can be corrected and retried.' : outcome === 'complete' ? 'Local check complete. No remote review or publication occurred.' : 'No local check requested.'}</p>
        </TabsContent>
        <TabsContent value="history" keepMounted={keepMounted}><p>The current local draft has {draft.length} UTF-16 code units. There is no persisted revision history.</p></TabsContent>
      </Tabs>
    </div></DirectionProvider>
    <p role="status">Selected local view: {value}. {automatic ? 'Automatic' : 'Manual'} activation. Remote review is unavailable.</p>
    <Button type="button" variant="outline" onClick={() => { setDraft('English-only local draft'); setValue('draft'); setOutcome('idle'); }}>Restore local tab draft</Button>
  </div>;
}
