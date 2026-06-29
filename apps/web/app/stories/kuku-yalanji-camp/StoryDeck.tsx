'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, X, RotateCcw, BookOpen } from 'lucide-react';
import { cn } from '@mobtranslate/ui';

// Every Kuku Yalanji word below is a real entry from the MobTranslate
// dictionary (language code kuku_yalanji) — nothing invented. English is shown
// in the faded treatment; the language word leads.
type Extra = { w: string; g: string };
type Slide = {
  img: string;
  credit: string;
  eyebrow: string;
  word: string;
  gloss: string;
  extra?: Extra[];
  text: string;
  lookup: string;
};

const BASE = '/stories/kuku-yalanji-camp';

const SLIDES: Slide[] = [
  {
    img: `${BASE}/country.jpg`,
    credit: 'Robert Linsdell · CC BY 2.0',
    eyebrow: 'A Kuku Yalanji yarn',
    word: 'Bubu',
    gloss: 'country · home',
    text: 'A day with an elder — told over turtle and kangaroo, fire and stars.',
    lookup: 'bubu',
  },
  {
    img: `${BASE}/yarning.jpg`,
    credit: 'Lepidlizard · Public domain',
    eyebrow: 'The visit',
    word: 'Manda',
    gloss: 'nephew · sister’s son',
    extra: [{ w: 'bingabinga', g: 'elder, old man' }],
    text: 'One morning the young man came down the road to sit with his bingabinga — his old man, his elder.',
    lookup: 'manda',
  },
  {
    img: `${BASE}/kangaroo.jpg`,
    credit: 'Toby Hudson · CC BY-SA 3.0',
    eyebrow: 'Family',
    word: 'Bambal',
    gloss: 'family',
    text: 'They yarned for hours — about kin and country, who belongs to who, and the ones who came before.',
    lookup: 'bambal',
  },
  {
    img: `${BASE}/turtle.jpg`,
    credit: 'Holobionics · CC BY-SA 4.0',
    eyebrow: 'Sharing food',
    word: 'Nukal',
    gloss: 'to eat',
    extra: [{ w: 'ngawiya', g: 'sea turtle' }, { w: 'mayarriji', g: 'kangaroo' }],
    text: 'They ate together the old way — ngawiya, the sea turtle, and mayarriji, the kangaroo.',
    lookup: 'nukal',
  },
  {
    img: `${BASE}/bush.jpg`,
    credit: 'Dietmar Rabich · CC BY-SA 4.0',
    eyebrow: 'Into the bush',
    word: 'Madja',
    gloss: 'rainforest',
    extra: [{ w: 'duduy', g: 'bush' }],
    text: 'When the heat dropped, they walked out into the duduy — the bush — following tracks the elder had known all his life.',
    lookup: 'madja',
  },
  {
    img: `${BASE}/fire.jpg`,
    credit: 'Janne Karaste · CC BY-SA 3.0',
    eyebrow: 'Making fire',
    word: 'Baya',
    gloss: 'fire',
    extra: [{ w: 'kubu', g: 'smoke' }],
    text: 'They gathered wood and lit a fire. Kubu — smoke — rose into the trees as the light went soft.',
    lookup: 'baya',
  },
  {
    img: `${BASE}/camp.jpg`,
    credit: 'Lori Branham · CC BY 2.0',
    eyebrow: 'Making camp',
    word: 'Bayan',
    gloss: 'camp',
    text: 'They made bayan for the night, close to the warmth, the fire keeping watch.',
    lookup: 'bayan',
  },
  {
    img: `${BASE}/stars.jpg`,
    credit: 'Jordan Condon · CC BY 3.0',
    eyebrow: 'Under the stars',
    word: 'Wujurr',
    gloss: 'night',
    extra: [{ w: 'dawar', g: 'star' }],
    text: 'Through the wujurr they talked on, until the dawar — the stars — filled the whole sky.',
    lookup: 'wujurr',
  },
  {
    img: `${BASE}/dawn.jpg`,
    credit: 'Radness.com.au · CC BY-SA 3.0',
    eyebrow: 'Daybreak',
    word: 'Muduwaju',
    gloss: 'dawn · daybreak',
    text: 'By muduwaju, the stories had passed from elder to nephew — and the language lived another day.',
    lookup: 'muduwaju',
  },
];

const DICT = (w: string) => `/dictionaries/kuku_yalanji?search=${encodeURIComponent(w)}`;

export function StoryDeck() {
  const [i, setI] = useState(0);
  const n = SLIDES.length;
  const atEnd = i === n - 1;

  const go = useCallback((d: number) => setI((v) => Math.max(0, Math.min(n - 1, v + d))), [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Home') setI(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // touch swipe
  const startX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
    startX.current = null;
  };

  return (
    <div
      className="relative h-[100dvh] w-full select-none overflow-hidden bg-[#161009] text-[#f7f2ea]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Stacked, cross-fading slides (image + scrim + story text) */}
      {SLIDES.map((s, idx) => {
        const active = idx === i;
        return (
          <article
            key={idx}
            aria-hidden={!active}
            className={cn(
              'absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none',
              active ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <img
              src={s.img}
              alt={`${s.eyebrow}: ${s.gloss} (${s.word}) — Kuku Yalanji story`}
              loading={idx <= 1 ? 'eager' : 'lazy'}
              className={cn(
                'h-full w-full object-cover transition-transform duration-[7000ms] ease-out motion-reduce:transition-none',
                active ? 'scale-110' : 'scale-100',
              )}
            />
            {/* Warm legibility scrim — darkest at the bottom where the text sits */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
            <div className="absolute inset-0 bg-[#2a1a0e] mix-blend-multiply opacity-30" />

            {/* Story text, lower third */}
            <div className="absolute inset-x-0 bottom-0">
              <div className="mx-auto max-w-3xl px-6 pb-28 sm:pb-32">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#e8b78a]">{s.eyebrow}</p>
                <h2
                  lang="zku"
                  className="font-display text-6xl font-bold leading-[0.95] tracking-tight text-[#fbf6ee] drop-shadow-sm sm:text-7xl"
                >
                  {s.word}
                </h2>
                {/* English — faded */}
                <p className="mt-2 font-display text-2xl font-normal italic text-white/55">{s.gloss}</p>

                {s.extra && s.extra.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                    {s.extra.map((e) => (
                      <span key={e.w} className="text-lg">
                        <span lang="zku" className="font-semibold text-[#fbf6ee]">{e.w}</span>
                        <span className="text-white/45"> — {e.g}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* English narration — faded, storybook serif */}
                <p className="mt-5 max-w-2xl font-display text-xl italic leading-relaxed text-white/75 sm:text-2xl">
                  {s.text}
                </p>

                <Link
                  href={DICT(s.lookup)}
                  className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 py-2 text-base font-medium text-white/85 backdrop-blur-sm transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8b78a]"
                >
                  <BookOpen className="h-5 w-5 text-[#e8b78a]" />
                  Look up <span lang="zku" className="font-semibold">{s.word.toLowerCase()}</span> in the dictionary
                </Link>
              </div>
            </div>
          </article>
        );
      })}

      {/* Top bar (persistent) */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-4"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">Kuku Yalanji</span>
        <Link
          href="/dictionaries/kuku_yalanji"
          aria-label="Leave the story"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X className="h-6 w-6" />
        </Link>
      </div>

      {/* Floating side arrows — desktop/tablet only (would overlap text on a phone) */}
      {i > 0 && (
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous"
          className="absolute left-3 top-1/2 z-30 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/85 backdrop-blur-sm transition hover:bg-black/55 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:flex"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next"
          className="absolute right-3 top-1/2 z-30 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-[#b45e2a]/85 text-white shadow-lg backdrop-blur-sm transition hover:bg-[#b45e2a] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:flex"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      {/* Bottom navigation bar: Prev · dots+credit · Next/Restart (primary nav on phones) */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8"
      >
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={i === 0}
          aria-label="Previous"
          className="flex flex-shrink-0 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ height: '3.25rem', width: '3.25rem' }}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>

        <div className="flex min-w-0 flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to part ${idx + 1}`}
                onClick={() => setI(idx)}
                className={cn(
                  'h-2.5 rounded-full transition-all duration-300 motion-reduce:transition-none',
                  idx === i ? 'w-7 bg-[#e8b78a]' : 'w-2.5 bg-white/30 hover:bg-white/55',
                )}
              />
            ))}
          </div>
          <span className="truncate text-[11px] text-white/45">{SLIDES[i].credit}</span>
        </div>

        {atEnd ? (
          <button
            type="button"
            onClick={() => setI(0)}
            aria-label="Start again"
            className="flex flex-shrink-0 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ height: '3.25rem', width: '3.25rem' }}
          >
            <RotateCcw className="h-6 w-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next"
            className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#b45e2a] text-white shadow-lg transition hover:bg-[#9d4f22] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ height: '3.25rem', width: '3.25rem' }}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>
    </div>
  );
}
