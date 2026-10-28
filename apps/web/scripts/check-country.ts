// Quick check of Country entry files, the same rules as
// __tests__/lib/countryEntries.test.ts without starting the test runner.
//
//   npx tsx scripts/check-country.ts [slug ...]
import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import {
  countryEntrySchema,
  countryLocationsSchema,
  entryTexts,
  SECTION_IDS,
  wantedPagesSchema,
} from '../lib/country/schema';
import { countryLinksIn } from '../lib/country/links';

const DATA_DIR = path.resolve(__dirname, '../data/country/kuku_yalanji');
const DICTIONARY = path.resolve(__dirname, '../../../dictionaries/kuku_yalanji/dictionary.yaml');

const headwords = new Set(
  ((loadYaml(fs.readFileSync(DICTIONARY, 'utf8')) as { words: { word: string }[] }).words ?? []).map((w) => w.word),
);
const jsonIn = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.json')) : []);
const files = jsonIn(DATA_DIR);
const entrySlugs = new Set(files.map((file) => file.replace(/\.json$/, '')));
const placeSlugs = new Set(jsonIn(path.join(DATA_DIR, 'places')).map((file) => file.replace(/\.json$/, '')));
const wantedSlugs = new Set(
  jsonIn(path.join(DATA_DIR, 'wanted')).flatMap((file) =>
    wantedPagesSchema.parse(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'wanted', file), 'utf8'))).pages.map((p) => p.slug),
  ),
);
const locationIds = countryLocationsSchema
  .parse(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'locations', 'index.json'), 'utf8')))
  .locations.map((location) => location.id);

const sorted = (order: number[]) => order.every((value, index) => index === 0 || order[index - 1] < value);

const only = process.argv.slice(2);
let failures = 0;
for (const file of files.filter((f) => only.length === 0 || only.includes(f.replace(/\.json$/, '')))) {
  const problems: string[] = [];
  const parsed = countryEntrySchema.safeParse(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')));
  if (!parsed.success) {
    problems.push(...parsed.error.issues.map((issue) => `schema: ${issue.path.join('.')}: ${issue.message}`));
  } else {
    const entry = parsed.data;
    if (`${entry.slug}.json` !== file) problems.push(`slug ${entry.slug} does not match file name`);
    for (const word of [...entry.names, ...entry.relatedWords].map((name) => name.word)) {
      if (!headwords.has(word)) problems.push(`not a dictionary headword: ${word}`);
    }
    const text = entryTexts(entry).join('\n');
    const cited = new Set([...text.matchAll(/\[ref:([a-z0-9-]+)\]/g)].map((match) => match[1]));
    const declared = new Set(entry.references.map((ref) => ref.id));
    for (const id of cited) if (!declared.has(id)) problems.push(`cites undeclared reference: ${id}`);
    for (const id of declared) if (!cited.has(id)) problems.push(`reference never cited: ${id}`);
    for (const link of countryLinksIn(text)) {
      const ok =
        link.kind === 'entry'
          ? entrySlugs.has(link.slug) || wantedSlugs.has(link.slug)
          : link.kind === 'place'
            ? placeSlugs.has(link.slug)
            : headwords.has(link.slug);
      if (!ok) problems.push(`broken link: ${link.kind}:${link.slug}`);
    }
    for (const slug of entry.relatedEntries) if (!entrySlugs.has(slug)) problems.push(`related entry missing: ${slug}`);
    if (!sorted(entry.sections.map((section) => SECTION_IDS.indexOf(section.id)))) {
      problems.push('sections out of order or repeated');
    }
    const order = entry.locations.map((segment) => locationIds.indexOf(segment.location));
    if (order.some((index) => index < 0)) problems.push('segment for an unregistered location');
    else if (!sorted(order)) problems.push('location segments out of registry order or repeated');
    for (const segment of entry.locations) {
      if (!sorted(segment.sections.map((section) => SECTION_IDS.indexOf(section.id)))) {
        problems.push(`${segment.location}: sections out of order or repeated`);
      }
    }
  }
  if (problems.length > 0) {
    failures += 1;
    console.log(`${file}\n  ${problems.join('\n  ')}`);
  }
}
console.log(failures === 0 ? 'ok' : `${failures} file(s) with problems`);
process.exit(failures === 0 ? 0 : 1);
