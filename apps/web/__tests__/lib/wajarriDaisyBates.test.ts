import { describe, expect, it } from 'vitest';
import { buildDaisyBatesWajidaInventory } from '@/lib/research/wajarriDaisyBates';

const HTML = `<!doctype html><html><body>
  <div id="about-text">
    <p><span class="heading">Title: </span>Vocabulary of Wajida, test witness</p>
    <p><span class="heading">Language: </span>Watjarri</p>
  </div>
  <table>
    <tr data-ts-image="/images/54/54-201T.jpg" data-ms-image="/images/54/54-234M.jpg">
      <td><span class="term" title="Water">Baba</span></td>
      <td><a class="gloss">Water</a></td>
    </tr>
    <tr data-ts-image="/images/54/54-201T.jpg">
      <td><span class="term">Baba ngarngu</span></td>
      <td><a class="gloss">To drink</a> - <a class="gloss">Water eat</a></td>
    </tr>
  </table>
  <a href="/images/54/54-201T.jpg">typescript</a>
</body></html>`;

const DICTIONARY = [
  {
    Wajarri: 'baba',
    English: 'water',
    description: 'water',
    sound: 'baba.mp3',
  },
];

describe('buildDaisyBatesWajidaInventory', () => {
  it('preserves source rows and image provenance without authorizing use', () => {
    const result = buildDaisyBatesWajidaInventory({
      html: HTML,
      currentDictionaryValue: DICTIONARY,
    });

    expect(result.report).toMatchObject({
      sourceRows: 2,
      singleTokenSourceRows: 1,
      multiTokenSourceRows: 1,
      typescriptImages: 1,
      manuscriptImages: 1,
      exactCurrentHeadwordRows: 1,
      directSupervisionRows: 0,
      trainingRows: 0,
      syntheticRows: 0,
      productiveGrammarRules: 0,
    });
    expect(result.sourceRows[0]).toMatchObject({
      termSource: 'Baba',
      glossSource: 'Water',
      currentDictionaryRelation: 'unique_exact_current_headword',
      trainingEligibility: 'not_eligible',
      syntheticEligibility: 'not_eligible',
      synthetic: false,
    });
    expect(result.sourceRows[1].glossFragmentsSource).toEqual([
      'To drink',
      'Water eat',
    ]);
  });

  it('preserves an empty source gloss without manufacturing content', () => {
    const result = buildDaisyBatesWajidaInventory({
      html: HTML.replace('<a class="gloss">Water</a>', ''),
      currentDictionaryValue: DICTIONARY,
    });

    expect(result.sourceRows[0]).toMatchObject({
      glossSource: '',
      glossTokenCount: 0,
      glossStatus: 'empty_source_gloss_preserved',
      trainingEligibility: 'not_eligible',
      syntheticEligibility: 'not_eligible',
    });
    expect(result.report.emptyGlossSourceRows).toBe(1);
  });

  it('fails closed when page-image provenance is missing', () => {
    expect(() =>
      buildDaisyBatesWajidaInventory({
        html: HTML.replace(' data-ts-image="/images/54/54-201T.jpg"', ''),
        currentDictionaryValue: DICTIONARY,
      }),
    ).toThrow();
  });
});
