import { useEffect, useState } from 'react';
import { getLanguages, type Language } from './api';
import { fallbackGovernance } from './langMeta';

// Module-level cache so we fetch the language list only once per app run.
let cache: Language[] | null = null;
let inflight: Promise<Language[]> | null = null;

// Order the languages we have the most content for first.
const PREFERRED = ['kuku_yalanji', 'anindilyakwa', 'wbv', 'migmaq'];

/** Curated languages keep the app useful while the live directory is offline. */
export const FALLBACK_LANGUAGES: Language[] = [
  { id: 'kuku_yalanji', code: 'kuku_yalanji', name: 'Kuku Yalanji', governance: fallbackGovernance('kuku_yalanji') },
  { id: 'anindilyakwa', code: 'anindilyakwa', name: 'Anindilyakwa', governance: fallbackGovernance('anindilyakwa') },
  { id: 'migmaq', code: 'migmaq', name: "Mi'gmaq", governance: fallbackGovernance('migmaq') },
];

function order(langs: Language[]): Language[] {
  return [...langs].sort((a, b) => {
    const ia = PREFERRED.indexOf(a.code);
    const ib = PREFERRED.indexOf(b.code);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export function useLanguages() {
  const [languages, setLanguages] = useState<Language[]>(cache ?? FALLBACK_LANGUAGES);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    inflight = inflight ?? getLanguages();
    inflight
      .then((l) => {
        cache = l.length ? order(l) : FALLBACK_LANGUAGES;
        if (alive) { setLanguages(cache); setLoading(false); }
      })
      .catch((e) => {
        cache = FALLBACK_LANGUAGES;
        if (alive) { setLanguages(cache); setError(String(e?.message ?? e)); setLoading(false); }
      });
    return () => { alive = false; };
  }, []);

  return { languages, loading, error };
}

export function languageId(languages: Language[], code: string): string | undefined {
  return languages.find((l) => l.code === code)?.id;
}
