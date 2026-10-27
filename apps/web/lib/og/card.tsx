import fs from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import australia from './australia.json';

/**
 * Link-preview cards for dictionaries and words, in the homepage card's look:
 * the earth ground, Playfair for the Indigenous word, and the language's place
 * on a plain outline of Australia.
 */
export const CARD_SIZE = { width: 1200, height: 630 };

const EARTH = '#2b150b';
const CREAM = '#faf8f5';
const OCHRE = '#ecb485';

/**
 * Where each dictionary's language is, as Glottolog places it
 * (public/map-data/points.geojson). Languages from outside Australia get no map.
 */
const LANGUAGE_PLACES: Record<string, [lon: number, lat: number]> = {
  kuku_yalanji: [145.188, -16.0036],
  anindilyakwa: [136.6415, -13.999],
  wbv: [117.153, -28.1761],
};

const asset = (file: string) => fs.readFile(path.join(process.cwd(), 'data', 'og', file));

type Font = { name: string; data: Buffer; weight: 400 | 500 | 600; style: 'normal' };
let assets: Promise<{ fonts: Font[]; logo: string }> | null = null;

function loadAssets() {
  assets ??= Promise.all([
    asset('playfair-600.woff'),
    asset('inter-400.woff'),
    asset('inter-500.woff'),
    asset('inter-600.woff'),
    asset('logomark-dark.svg'),
  ]).then(([playfair, inter400, inter500, inter600, logo]) => ({
    fonts: [
      { name: 'Playfair', data: playfair, weight: 600, style: 'normal' },
      { name: 'Inter', data: inter400, weight: 400, style: 'normal' },
      { name: 'Inter', data: inter500, weight: 500, style: 'normal' },
      { name: 'Inter', data: inter600, weight: 600, style: 'normal' },
    ] satisfies Font[],
    logo: `data:image/svg+xml;base64,${logo.toString('base64')}`,
  }));
  // A failed read should not stick for the life of the process.
  assets.catch(() => {
    assets = null;
  });
  return assets;
}

function project([lon, lat]: [number, number]) {
  return {
    x: (lon * australia.k - australia.minX) * australia.scale,
    y: (-lat - australia.minY) * australia.scale,
  };
}

/** Big enough to carry the card, small enough to fit its column. */
function headlineSize(text: string, column: number) {
  const fit = Math.floor(column / (0.56 * Math.max(text.length, 1)));
  return Math.max(60, Math.min(156, fit));
}

export function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 12)).replace(/[\s,;:.-]+$/, '')}…`;
}

type CardInput = {
  /** Small line above the headline, usually the language. */
  kicker: string;
  /** The word or dictionary name, in Playfair. */
  headline: string;
  /** The meaning, or a line about the dictionary. */
  body?: string;
  footer: string;
  /** Dictionary code; marks the language's place when it is in Australia. */
  language?: string;
};

export async function renderCard({ kicker, headline, body, footer, language }: CardInput) {
  const { fonts, logo } = await loadAssets();
  const place = language ? LANGUAGE_PLACES[language] : undefined;
  const marker = place ? project(place) : null;
  const column = marker ? 560 : 1050;
  const size = headlineSize(headline, column);
  const MAP_LEFT = 700;
  const MAP_TOP = 116;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: EARTH,
          backgroundImage: marker
            ? 'radial-gradient(circle at 905px 320px, rgba(226,148,85,0.17), rgba(43,21,11,0) 62%)'
            : 'radial-gradient(circle at 300px 260px, rgba(226,148,85,0.14), rgba(43,21,11,0) 65%)',
          color: CREAM,
          fontFamily: 'Inter',
        }}
      >
        {marker && (
          <svg
            width={australia.width}
            height={australia.height}
            viewBox={`0 0 ${australia.width} ${australia.height}`}
            style={{ position: 'absolute', left: MAP_LEFT, top: MAP_TOP }}
          >
            <path
              d={australia.path}
              fill="rgba(236,180,133,0.075)"
              stroke="rgba(250,248,245,0.34)"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <circle cx={marker.x} cy={marker.y} r={22} fill="rgba(236,180,133,0.16)" />
            <circle cx={marker.x} cy={marker.y} r={11} fill="rgba(236,180,133,0.28)" />
            <circle cx={marker.x} cy={marker.y} r={6} fill={OCHRE} stroke={EARTH} strokeWidth={2} />
          </svg>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '62px 72px 54px',
            width: marker ? 700 : 1200,
            height: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={52} height={43} alt="" />
            <div style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-0.01em' }}>Mob Translate</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: OCHRE, marginBottom: 14 }}>{kicker}</div>
            <div
              style={{
                fontFamily: 'Playfair',
                fontWeight: 600,
                fontSize: size,
                lineHeight: 1.02,
                letterSpacing: '-0.015em',
                maxWidth: column,
              }}
            >
              {headline}
            </div>
            {body && (
              <div
                style={{
                  fontSize: 32,
                  lineHeight: 1.36,
                  color: 'rgba(250,248,245,0.8)',
                  marginTop: 22,
                  maxWidth: column,
                }}
              >
                {body}
              </div>
            )}
          </div>
          <div style={{ fontSize: 21, fontWeight: 500, color: 'rgba(250,248,245,0.56)' }}>{footer}</div>
        </div>
      </div>
    ),
    {
      ...CARD_SIZE,
      fonts,
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
    },
  );
}
