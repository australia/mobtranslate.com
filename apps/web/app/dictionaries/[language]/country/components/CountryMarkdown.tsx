import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { resolveCountryLinks } from '@/lib/country/links';

// Entry text marks citations as `[ref:<id>]`; render them as numbered
// superscript links to the reference list, Wikipedia style.
export function withCitationLinks(markdown: string, refNumbers: Map<string, number>): string {
  return markdown.replace(/\s?\[ref:([a-z0-9-]+)\]/g, (_, id: string) => {
    const n = refNumbers.get(id);
    return n ? `[${n}](#ref-${id})` : '';
  });
}

export function CountryMarkdown({
  children,
  refNumbers,
  language,
}: {
  children: string;
  refNumbers: Map<string, number>;
  language: string;
}) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children: label }) => {
          if (href?.startsWith('#ref-')) {
            return (
              <sup className="ml-0.5">
                <a href={href} className="text-[var(--lang-accent)] no-underline hover:underline">
                  [{label}]
                </a>
              </sup>
            );
          }
          if (href?.startsWith('/')) {
            return (
              <Link
                href={href}
                className="font-medium text-[var(--lang-accent)] underline decoration-[var(--lang-accent)] decoration-1 underline-offset-2 hover:decoration-2"
              >
                {label}
              </Link>
            );
          }
          return (
            <a href={href} className="text-[var(--lang-accent)] underline underline-offset-2" rel="noopener noreferrer">
              {label}
            </a>
          );
        },
        p: ({ children: text }) => <p className="mb-4 leading-7">{text}</p>,
        ol: ({ children: items }) => <ol className="mb-4 ml-5 list-decimal space-y-2 leading-7">{items}</ol>,
        ul: ({ children: items }) => <ul className="mb-4 ml-5 list-disc space-y-2 leading-7">{items}</ul>,
        strong: ({ children: text }) => <strong className="font-semibold text-foreground">{text}</strong>,
      }}
    >
      {withCitationLinks(resolveCountryLinks(children, language), refNumbers)}
    </ReactMarkdown>
  );
}
