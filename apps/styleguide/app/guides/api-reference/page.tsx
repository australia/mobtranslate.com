import { Section } from '../../../components/section';
import { CodeBlock } from '../../../components/code-block';
import { APIReference } from '../../../components/api-reference';
import index from '../../../public/api-reference/index.json';
import initial from '../../../public/api-reference/Button.json';

export default function Page() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">API Reference</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Every public export resolved from the installed TypeScript library, including inherited prop contracts and declaration sources.</p>
    <Section title="Choose and inspect an export"><APIReference index={index} initial={initial} /></Section>
    <Section title="Read types alongside behavior"><p>This register is generated from packages/ui/src/index.ts using the workspace compiler. It includes runtime exports, type-only declarations, callable signatures and component props. The authored component pages explain when to use them, runtime defaults, controlled state, event sequences, composition, dimensions and accessibility. A type accepting an attribute does not prove that a custom rendered element supports its semantics.</p><p className="mt-4">Inherited contracts come from the installed React and pinned Base UI types. Newer upstream documentation may differ. Declaration paths and line numbers refer to this installed workspace; dependency paths can include exact versions. Optional properties do not imply false, empty or zero defaults.</p><div className="doc-links mt-4"><a href="/guides/composition">Composition guidance</a><a href="/guides/component-specifications">Rendered specifications</a><a href="/guides/migration">Migration guidance</a></div></Section>
    <Section title="Generation and verification"><p>The index and each export document carry the same content revision. Only the selected export loads; a missing, failed or mismatched response offers recovery instead of displaying a different contract. Hash links select exports directly. Generate before building and check freshness after source or dependency changes.</p><CodeBlock language="bash" code={'pnpm --filter styleguide api:generate\npnpm --filter styleguide api:check\npnpm --filter styleguide build'} /><p className="mt-4">Compiler revision: <code className="break-all">{index.revision}</code>. This identifies the generated contract data, not a public deployment.</p></Section>
  </div>;
}
