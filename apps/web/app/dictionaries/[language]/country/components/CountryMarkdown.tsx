import ReactMarkdown from 'react-markdown';

// Entry text marks citations as `[ref:<id>]`; render them as numbered
// superscript links to the reference list, Wikipedia style.
export function withCitationLinks(markdown: string, refNumbers: Map<string, number>): string {
  return markdown.replace(/\s?\[ref:([a-z0-9-]+)\]/g, (_, id: string) => {
    const n = refNumbers.get(id);
    return n ? `[${n}](#ref-${id})` : '';
  });
}

export function CountryMarkdown({ children, refNumbers }: { children: string; refNumbers: Map<string, number> }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children: label }) =>
          href?.startsWith('#ref-') ? (
            <sup className="ml-0.5">
              <a href={href} className="text-[var(--lang-accent)] no-underline hover:underline">
                [{label}]
              </a>
            </sup>
          ) : (
            <a href={href} className="text-[var(--lang-accent)] underline underline-offset-2">
              {label}
            </a>
          ),
        p: ({ children: text }) => <p className="mb-4 leading-7">{text}</p>,
        ol: ({ children: items }) => <ol className="mb-4 ml-5 list-decimal space-y-2 leading-7">{items}</ol>,
        ul: ({ children: items }) => <ul className="mb-4 ml-5 list-disc space-y-2 leading-7">{items}</ul>,
        strong: ({ children: text }) => <strong className="font-semibold text-foreground">{text}</strong>,
      }}
    >
      {withCitationLinks(children, refNumbers)}
    </ReactMarkdown>
  );
}
