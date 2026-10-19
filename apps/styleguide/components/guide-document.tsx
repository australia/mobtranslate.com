import type { ReactNode } from 'react';
import Link from 'next/link';
import { Section } from './section';
import { CodeBlock } from './code-block';

export interface GuideDocumentData {
  title: string;
  description: string;
  sections: {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
    table?: { headings: string[]; rows: string[][] };
    code?: { language: string; value: string };
    example?: ReactNode;
  }[];
  related: { label: string; href: string }[];
}

export function GuideDocument({ document }: { document: GuideDocumentData }) {
  return <div>
    <h1 className="text-4xl font-bold mb-2">{document.title}</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">{document.description}</p>
    {document.sections.map((section) => <Section key={section.title} title={section.title}>
      {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mb-4 max-w-[72ch]">{paragraph}</p>)}
      {section.bullets && <ul className="guidance-list">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
      {section.table && <div className="doc-table" tabIndex={0} role="region" aria-label={`${section.title} table`}><table>
        <thead><tr>{section.table.headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{section.table.rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th scope="row" key={index}>{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody>
      </table></div>}
      {section.example}
      {section.code && <CodeBlock language={section.code.language} code={section.code.value} />}
    </Section>)}
    <Section title="Related guidance"><div className="doc-links">{document.related.map((link) => link.href.startsWith('/') ? <Link key={link.href} href={link.href}>{link.label}</Link> : <a key={link.href} href={link.href}>{link.label}</a>)}</div></Section>
  </div>;
}
