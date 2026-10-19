'use client';
import { useState } from 'react';
import { Button, DirectionProvider, Toolbar, ToolbarButton, ToolbarGroup, ToolbarLink, ToolbarSeparator } from '@mobtranslate/ui';

export function NavigationToolbarExample() {
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [copies, setCopies] = useState(0);
  const [vertical, setVertical] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [skipDisabled, setSkipDisabled] = useState(false);
  const direction = rtl ? 'rtl' : 'ltr';
  return <div data-toolbar-lab className="space-y-4">
    <p data-toolbar-sample style={{fontWeight: bold ? 700 : 400, fontStyle: italic ? 'italic' : 'normal'}}>English-only local sample. Local copies: {copies}.</p>
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" aria-pressed={vertical} onClick={() => setVertical(current => !current)}>Use vertical local toolbar</Button>
      <Button type="button" variant="outline" aria-pressed={rtl} onClick={() => setRtl(current => !current)}>Use RTL local toolbar</Button>
      <Button type="button" variant="outline" aria-pressed={disabled} onClick={() => setDisabled(current => !current)}>Disable local toolbar buttons</Button>
      <Button type="button" variant="outline" aria-pressed={skipDisabled} onClick={() => setSkipDisabled(current => !current)}>Skip unavailable toolbar action</Button>
    </div>
    <DirectionProvider direction={direction}><div dir={direction}>
      <Toolbar aria-label="Local sample actions" orientation={vertical ? 'vertical' : 'horizontal'} disabled={disabled} className={state => state.disabled ? 'local-toolbar-disabled' : undefined}>
        <ToolbarGroup aria-label="Local text emphasis">
          <ToolbarButton type="button" aria-pressed={bold} onClick={() => setBold(current => !current)}>Bold local text</ToolbarButton>
          <ToolbarButton type="button" aria-pressed={italic} onClick={() => setItalic(current => !current)}>Italic local text</ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarButton type="button" onClick={() => setCopies(current => current + 1)}>Duplicate local sample</ToolbarButton>
        <ToolbarButton type="button" disabled focusableWhenDisabled={!skipDisabled} onClick={() => setCopies(-999)}>Remote publish unavailable</ToolbarButton>
        <ToolbarLink href="#toolbar-task-context">Read local task context</ToolbarLink>
      </Toolbar>
    </div></DirectionProvider>
    <p id="toolbar-task-context" tabIndex={-1}>The toolbar changes local presentation and copy count. Its context link remains a real destination even while buttons are disabled. No remote write or language review occurs.</p>
    <Button type="button" variant="outline" onClick={() => { setBold(false); setItalic(false); setCopies(0); setDisabled(false); }}>Restore local toolbar sample</Button>
    <p role="status">Local emphasis: {bold ? 'bold' : 'regular'}, {italic ? 'italic' : 'upright'}. Local copies: {copies}.</p>
  </div>;
}
