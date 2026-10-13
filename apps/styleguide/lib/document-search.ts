export interface SearchEntry {
  href: string;
  page: string;
  heading: string;
  text: string;
}
export interface SearchResult extends SearchEntry { score: number; snippet: string }

const whitespace = (text: string) => text.replace(/\s+/g, ' ').trim();
const normalized = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').toLocaleLowerCase('en');
export function searchTerms(query: string) {
  return [...new Set(normalized(query).match(/[\p{L}\p{N}_-]+/gu) ?? [])];
}

export function extractDocument(html: string, path: string): SearchEntry[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelector('main');
  const title = main?.querySelector('h1')?.textContent;
  if (!main || !title) throw new Error(`No documentation content at ${path}`);
  // Inert HTML parsing never executes examples. Ignore decorative and executable
  // markup, while keeping prose, API tables and literal source examples.
  main.querySelectorAll('script, style, template, [aria-hidden="true"], .code-toolbar, .copy-status').forEach(node => node.remove());
  const textOf = (root: Element) => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? '');
    return whitespace(parts.join(' '));
  };
  const page = whitespace(title);
  const entries: SearchEntry[] = [];
  for (const section of main.querySelectorAll('section')) {
    const heading = section.querySelector('h2[id]');
    if (!heading?.id) continue;
    entries.push({ href: `${path}#${encodeURIComponent(heading.id)}`, page, heading: whitespace(heading.textContent ?? ''), text: textOf(section) });
  }
  // Introductory text outside sections is searchable without repeating the
  // entire document in a second, generic result.
  main.querySelectorAll('section').forEach(node => node.remove());
  const intro = textOf(main);
  if (intro) entries.unshift({ href: `${path}#main-content`, page, heading: 'Overview', text: intro });
  return entries;
}

export async function loadDocuments(paths: string[], signal: AbortSignal, progress: (done: number, total: number) => void) {
  const entries: SearchEntry[] = [];
  let done = 0;
  progress(done, paths.length);
  // Limit cold compilation and network work on the shared box. Every route must
  // succeed before the tool can claim complete coverage.
  for (let start = 0; start < paths.length; start += 3) {
    const batch = await Promise.all(paths.slice(start, start + 3).map(async path => {
      const response = await fetch(path, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      const result = extractDocument(await response.text(), path);
      progress(++done, paths.length);
      return result;
    }));
    entries.push(...batch.flat());
  }
  return entries;
}

export function searchDocuments(entries: SearchEntry[], query: string): SearchResult[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const documents = entries.map(entry => ({ entry, body: normalized(entry.text), page: normalized(entry.page), heading: normalized(entry.heading) }));
  // Derived frequency weights favor distinctive terms without a synonym list
  // or a manually maintained map of topic names.
  const weights = terms.map(term => 1 + Math.log((documents.length + 1) / (1 + documents.filter(doc => doc.body.includes(term) || doc.page.includes(term)).length)));
  return documents.filter(doc => terms.every(term => doc.body.includes(term) || doc.page.includes(term))).map(doc => {
    const score = terms.reduce((total, term, index) => total + weights[index] * (1 + (doc.page.includes(term) ? 8 : 0) + (doc.heading.includes(term) ? 5 : 0)), 0);
    const matches = terms.map((term, index) => ({ position: doc.entry.text.toLocaleLowerCase('en').indexOf(term), weight: weights[index] }))
      .filter(match => match.position >= 0).sort((a, b) => b.weight - a.weight || a.position - b.position);
    const position = matches[0]?.position ?? 0;
    const start = Math.max(0, position - 70);
    const end = Math.min(doc.entry.text.length, start + 260);
    return { ...doc.entry, score, snippet: `${start ? '…' : ''}${doc.entry.text.slice(start, end)}${end < doc.entry.text.length ? '…' : ''}` };
  }).sort((a, b) => b.score - a.score || a.href.localeCompare(b.href, 'en'));
}
