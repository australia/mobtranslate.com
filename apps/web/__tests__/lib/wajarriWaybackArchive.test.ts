import { describe, expect, it } from 'vitest';
import {
  buildWajarriArchiveAssets,
  buildWajarriDictionaryAudioCrosswalk,
  parseWajarriCdxExport,
  sha1Base32,
} from '@/lib/research/wajarriWaybackArchive';

const cdx = [
  ['timestamp', 'original', 'statuscode', 'mimetype', 'digest', 'length'],
  [
    '20160229135557',
    'http://www.bundiyarra.com.au/wajarriApp/audio/Track1.mp3',
    '200',
    'audio/mpeg',
    'CTKCKGT5JR2V4QRMAAFLYI2VTW445QEA',
    '8373',
  ],
  [
    '20150905212855',
    'http://www.bundiyarra.com.au:80/wajarriApp/',
    '200',
    'text/html',
    'JAPNSHWHLWX4NAKYEOQTXMNCGLKYUSR7',
    '3222',
  ],
];

describe('Wajarri Wayback archive inventory', () => {
  it('validates CDX rows and creates collision-free replay paths', () => {
    const assets = buildWajarriArchiveAssets(parseWajarriCdxExport(cdx));
    expect(assets).toHaveLength(2);
    expect(assets.find((asset) => asset.assetKind === 'audio')).toMatchObject({
      archiveRelativePath: 'archive/audio/Track1.mp3',
      replayUrl:
        'https://web.archive.org/web/20160229135557id_/http://www.bundiyarra.com.au/wajarriApp/audio/Track1.mp3',
    });
    expect(
      assets.find((asset) => asset.assetKind === 'html')?.archiveRelativePath,
    ).toBe('archive/index.html');
  });

  it('maps dictionary records to archived recordings without granting training use', () => {
    const assets = buildWajarriArchiveAssets(parseWajarriCdxExport(cdx));
    const crosswalk = buildWajarriDictionaryAudioCrosswalk(assets, [
      {
        Wajarri: 'marlu',
        English: 'red kangaroo',
        description: 'red kangaroo',
        sound: 'Track1.mp3',
        image: 'logo.png',
      },
    ]);
    expect(crosswalk.missingPointers).toEqual([]);
    expect(crosswalk.extraArchiveAudioPointers).toEqual([]);
    expect(crosswalk.rows[0]).toMatchObject({
      sourceRecordId: 'wbv-src-local-000001',
      sourcePointer: 'Track1.mp3',
      resolutionStatus: 'wayback_capture_identified',
      linguisticStatus: 'candidate',
      trainingUse: 'not_allowed',
    });
    expect(
      crosswalk.assets.find((asset) => asset.assetKind === 'audio')
        ?.dictionaryReferenceCount,
    ).toBe(1);
  });

  it('rejects duplicate local paths and missing dictionary recordings', () => {
    expect(() => parseWajarriCdxExport([...cdx, cdx[1]])).toThrow(
      /duplicate CDX original URL/u,
    );
    const crosswalk = buildWajarriDictionaryAudioCrosswalk(
      buildWajarriArchiveAssets(parseWajarriCdxExport(cdx)),
      [
        {
          Wajarri: 'unknown',
          English: 'unknown',
          description: '',
          sound: 'Track999.mp3',
          image: 'logo.png',
        },
      ],
    );
    expect(crosswalk.missingPointers).toEqual(['Track999.mp3']);
  });

  it('reproduces the CDX SHA-1 Base32 digest algorithm', () => {
    expect(sha1Base32(Buffer.from('abc'))).toBe(
      'VGMT4NSHA2AWVOR6EVYXQUGCNSONBWE5',
    );
  });
});
