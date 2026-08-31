// @vitest-environment node

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildGeraldtonArchiveAssets,
  crosswalkGeraldtonAdoptionRows,
  parseGeraldtonAdoptionList,
  parseGeraldtonCdxExport,
} from '@/lib/research/geraldtonGoesWajarri';

const cdx = [
  ['timestamp', 'original', 'statuscode', 'mimetype', 'digest', 'length'],
  [
    '20210617074550',
    'http://geraldton-goes-wajarri.org/list/wajarri_list.php?skip=',
    '200',
    'text/html',
    'DJYAARU7OMY36SVWYMYINRGRGY7JASWQ',
    '7919',
  ],
];

const listHtml = `
  <table class="thread">
    <tr><th>Wajarri</th><th>English</th><th>Type / Color</th></tr>
    <tr>
      <td class="thread"><b><a href="show_item.php?nr=113&skip=0">birluny</a></b></td>
      <td class="thread"><a href="show_item.php?nr=113&skip=0">white</a></td>
      <td class="thread"><a href="show_item.php?nr=113&skip=0">objects &amp; categories</a></td>
    </tr>
  </table>`;

describe('Geraldton Goes Wajarri evidence', () => {
  it('creates a query-distinct CDX archive path', () => {
    const assets = buildGeraldtonArchiveAssets(parseGeraldtonCdxExport(cdx));
    expect(assets[0]).toMatchObject({
      assetKind: 'html',
      replayUrl:
        'https://web.archive.org/web/20210617074550id_/http://geraldton-goes-wajarri.org/list/wajarri_list.php?skip=',
    });
    expect(assets[0]?.archiveRelativePath).toMatch(
      /^archive\/list\/wajarri_list__q-[0-9a-f]{16}\.html$/u,
    );
  });

  it('parses source wording and category from the DOM', () => {
    const rows = parseGeraldtonAdoptionList({
      html: listHtml,
      snapshotId: 'ggw-2021',
      captureTimestamp: '20210617074550',
      sourceListUrl:
        'http://geraldton-goes-wajarri.org/list/wajarri_list.php?skip=',
      sourceListPath: 'archive/list/example.html',
      sourceListSha256: createHash('sha256').update(listHtml).digest('hex'),
    });
    expect(rows).toEqual([
      expect.objectContaining({
        sourceRecordId: 'wbv-ggw-20210617-0113',
        headwordSource: 'birluny',
        englishSource: 'white',
        categorySource: 'objects & categories',
        linguisticStatus: 'source_candidate',
        trainingUse: 'not_allowed',
      }),
    ]);
  });

  it('crosswalks exact headwords while leaving merge disabled', () => {
    const rows = parseGeraldtonAdoptionList({
      html: listHtml,
      snapshotId: 'ggw-2021',
      captureTimestamp: '20210617074550',
      sourceListUrl:
        'http://geraldton-goes-wajarri.org/list/wajarri_list.php?skip=',
      sourceListPath: 'archive/list/example.html',
      sourceListSha256: createHash('sha256').update(listHtml).digest('hex'),
    });
    const crosswalk = crosswalkGeraldtonAdoptionRows(rows, [
      {
        Wajarri: 'birluny',
        English: 'white',
        description: 'white',
        sound: 'Track1.mp3',
        image: 'logo.png',
      },
    ]);
    expect(crosswalk[0]).toMatchObject({
      relationStatus: 'exact_headword_and_english_candidate',
      sourceSurfaceTokenCount: 1,
      sourceUnitKind: 'single_surface_form',
      automaticMergeAllowed: false,
      trainingUse: 'not_allowed',
    });
    expect(crosswalk[0]?.currentCandidates[0]).toMatchObject({
      sourceRecordId: 'wbv-src-local-000001',
      exactEnglishField: true,
    });
    expect(crosswalk[0]?.reviewCandidates[0]).toMatchObject({
      sourceRecordId: 'wbv-src-local-000001',
      exactHeadword: true,
      headwordTrigramJaccard: 1,
    });

    const hyphenated = crosswalkGeraldtonAdoptionRows(
      [
        {
          ...rows[0]!,
          headwordSource: 'banda-bandayimanha',
          headwordComparison: 'banda-bandayimanha',
        },
      ],
      [
        {
          Wajarri: 'bandabandayimanha',
          English: 'hurrying',
          description: 'hurrying',
        },
      ],
    );
    expect(hyphenated[0]).toMatchObject({
      sourceSurfaceTokenCount: 1,
      sourceUnitKind: 'single_surface_form',
    });
  });
});
