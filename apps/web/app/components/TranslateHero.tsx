'use client';

import React, { useState, useRef } from 'react';
import { ArrowRight, Loader2, AlertTriangle, Copy, Check, MessageSquare, Languages } from 'lucide-react';
import { SpeakButton } from '@/components/audio/SpeakButton';
import Translator from './Translator';
import { TranslationCorrectionDialog } from '@/components/improvements/TranslationCorrectionDialog';
import { track } from '@/lib/analytics';
import type { Language } from '@/lib/supabase/types';

interface TranslateHeroProps {
  languages: Language[];
}

const EXAMPLES = ['Hello', 'Thank you', 'Water', 'My friend'];

type Mode = 'translate' | 'chat';

export default function TranslateHero({ languages }: TranslateHeroProps) {
  const [mode, setMode] = useState<Mode>('translate');
  const [input, setInput] = useState('');
  const [target, setTarget] = useState(
    languages.find((l) => l.code === 'kuku_yalanji')?.code || languages[0]?.code || 'kuku_yalanji',
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ translation: string; gloss?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const targetName = languages.find((l) => l.code === target)?.name || 'Indigenous';

  const translate = async () => {
    if (!input.trim()) return;
    track('translate', { language: target, text_length: input.trim().length });
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/translate/${target}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, mode: 'translate' }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Translation failed');
      }
      setResult({ translation: data.translation, gloss: data.gloss });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!result?.translation) return;
    await navigator.clipboard.writeText(result.translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') translate();
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Mode toggle + language picker */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="inline-flex rounded-lg bg-[rgba(255,255,255,0.08)] p-1 text-sm" role="tablist" aria-label="Mode">
          {(['translate', 'chat'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); track('hero_mode_switch', { mode: m }); }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium transition-colors ${
                mode === m ? 'bg-[#faf8f5] text-[#33180c]' : 'text-[#faf8f5]/70 hover:text-[#faf8f5]'
              }`}
            >
              {m === 'translate' ? <Languages className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
              {m === 'translate' ? 'Translate' : 'Chat'}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-[#faf8f5]/70">
          <span className="hidden sm:inline">Into</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Target language"
            className="rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] text-[#faf8f5] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ecb485]/50"
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code} className="bg-[#33180c] text-[#faf8f5]">
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === 'chat' ? (
        <Translator availableLanguages={languages} showExamples />
      ) : (
        <>
          <div
            data-language={target}
            className="grid grid-cols-1 md:grid-cols-2 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] overflow-hidden"
          >
            {/* English input */}
            <div className="p-5 md:border-r border-[rgba(255,255,255,0.1)] flex flex-col">
              <div className="text-xs font-medium uppercase tracking-[0.15em] text-[#faf8f5]/50 mb-3">
                English
              </div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Enter English text…"
                aria-label="Text to translate"
                rows={4}
                className="flex-1 w-full resize-none bg-transparent text-[#faf8f5] text-lg leading-relaxed placeholder:text-[#faf8f5]/35 focus:outline-none"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-[#faf8f5]/40">{input.length} characters</span>
                <button
                  onClick={translate}
                  disabled={!input.trim() || loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#ecb485] text-[#33180c] font-semibold px-4 py-2 text-sm hover:bg-[#f4d2b5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Translate
                </button>
              </div>
            </div>

            {/* Indigenous output */}
            <div className="p-5 flex flex-col min-h-[180px] bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium uppercase tracking-[0.15em] text-[#ecb485]">
                  {targetName}
                </span>
                {result?.translation && (
                  <SpeakButton
                    text={result.translation}
                    lang={target}
                    className="text-[#ecb485] hover:bg-[rgba(255,255,255,0.1)]"
                  />
                )}
              </div>

              <div className="flex-1">
                {loading ? (
                  <div className="space-y-3" aria-hidden="true">
                    <div className="h-7 w-2/3 rounded bg-[rgba(255,255,255,0.12)] animate-pulse" />
                    <div className="h-4 w-1/2 rounded bg-[rgba(255,255,255,0.07)] animate-pulse" />
                  </div>
                ) : error ? (
                  <div className="flex items-start gap-2 text-[#faf8f5]/80" role="alert">
                    <AlertTriangle className="w-4 h-4 mt-1 text-[#f4a056] shrink-0" />
                    <div>
                      <p className="text-sm mb-2">{error}</p>
                      <button onClick={translate} className="text-sm font-medium text-[#ecb485] hover:underline">
                        Try again
                      </button>
                    </div>
                  </div>
                ) : result?.translation ? (
                  <>
                    <p className="font-display text-2xl md:text-3xl leading-snug text-[#faf8f5]" lang={target}>
                      {result.translation}
                    </p>
                    {result.gloss && (
                      <p className="mt-2 text-sm text-[#faf8f5]/55">{result.gloss}</p>
                    )}
                  </>
                ) : (
                  <p className="text-[#faf8f5]/35 text-lg">Translation appears here.</p>
                )}
              </div>

              {result?.translation && (
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[rgba(255,255,255,0.08)] text-xs text-[#faf8f5]/50">
                  <button onClick={copy} className="inline-flex items-center gap-1.5 hover:text-[#faf8f5] transition-colors">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    AI-generated, needs community verification
                  </span>
                  <TranslationCorrectionDialog
                    languageCode={target}
                    sourceText={input}
                    currentTranslation={result.translation}
                    triggerClassName="inline-flex items-center gap-1.5 text-[#faf8f5]/50 hover:text-[#ecb485] transition-colors"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Examples */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <span className="text-xs text-[#faf8f5]/40 mr-1">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setInput(ex);
                  inputRef.current?.focus();
                }}
                className="px-3 py-1 text-xs rounded-full border border-[rgba(255,255,255,0.15)] text-[#faf8f5]/70 hover:text-[#faf8f5] hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.08)] transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
