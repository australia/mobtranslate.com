import { Section } from '../../../components/section';
import { CodeBlock } from '../../../components/code-block';
import { GlossaryExplorer } from '../../../examples/glossary-explorer';
import snippets from '../../../content/examples.json';
import reference from '../../../content/material-glossary-index.json';

export default function Page() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Design Glossary</h1>
    <p className="text-lg mb-8 text-[var(--color-muted-foreground)]">Definitions connected to actual decisions, failures, source contracts and platform boundaries.</p>
    <Section title="Reference and local meaning"><p>The rendered Material A–Z inventory captured on {reference.captured} has {reference.terms.length} headings. Each is represented here with an independently authored explanation for this project, alongside local implementation vocabulary. This is a terminology map, not a copy of Material’s definitions or a claim that every referenced platform API is implemented.</p><p className="mt-3">Color-generation, DSP and XR terms keep their implementation boundaries explicit. Follow the related guidance to inspect actual code and verification; a term name alone cannot establish a task outcome or language authority.</p><div className="doc-links mt-3"><a href={reference.source}>Material glossary reference</a><a href="https://github.com/material-foundation/material-color-utilities">Material Color Utilities</a><a href="/guides/material-coverage">Local Material coverage map</a></div></Section>
    <Section title="Find and use a term"><GlossaryExplorer /></Section>
    <Section title="Maintain the reference"><p>Edit the authored data in content/glossary.ts. Re-capture the rendered primary inventory when the reference changes; retain new headings as work. The check compares every reference heading, requires definitions/decisions/failures, verifies unique entry fragments and checks related routes against navigation.</p><CodeBlock language="bash" code={'pnpm --filter styleguide glossary:check\npnpm --filter styleguide examples:check\npnpm --filter styleguide build\n# After starting the production preview:\npnpm --filter styleguide test:inclusive-glossary'} /></Section>
    <Section title="Checked filter and link implementation"><p>All entries are available in server-rendered HTML. Filtering becomes operable after hydration. Entry links remain unfiltered shareable destinations, hash navigation reveals and focuses their headings, and clipboard failure preserves a manual link alternative.</p><CodeBlock code={snippets['examples/glossary-explorer.tsx']} /></Section>
  </div>;
}
