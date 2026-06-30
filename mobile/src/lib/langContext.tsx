import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useLanguages } from './useLanguages';
import { type Language } from './api';

const KEY = 'mt_lang';
const DEFAULT = 'kuku_yalanji';

interface LangCtx {
  code: string;
  setCode: (c: string) => void;
  languages: Language[];
  lang: Language | undefined;
  loading: boolean;
}

const Ctx = createContext<LangCtx>({ code: DEFAULT, setCode: () => {}, languages: [], lang: undefined, loading: true });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { languages, loading } = useLanguages();
  const [code, setCodeState] = useState(DEFAULT);
  const [ready, setReady] = useState(false);

  // restore persisted choice
  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => { if (v) setCodeState(v); setReady(true); }).catch(() => setReady(true));
  }, []);

  // if the persisted/default code isn't in the list once loaded, fall back to first
  useEffect(() => {
    if (languages.length && !languages.some((l) => l.code === code)) setCodeState(languages[0].code);
  }, [languages]);

  const setCode = (c: string) => { setCodeState(c); SecureStore.setItemAsync(KEY, c).catch(() => {}); };
  const lang = languages.find((l) => l.code === code);

  return (
    <Ctx.Provider value={{ code, setCode, languages, lang, loading: loading || !ready }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
