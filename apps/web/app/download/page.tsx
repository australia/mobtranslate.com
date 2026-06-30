import Link from 'next/link';
import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import { Download, Smartphone, Keyboard, Mic, ShieldCheck, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Get the app',
  description: 'Download the Mob Translate Android app — translate, look up words, hear pronunciation, record your language, and a built-in language keyboard.',
  alternates: { canonical: '/download' },
  openGraph: { title: 'Get the Mob Translate app', url: '/download', type: 'website' },
};

// Versioned filename so a new release is never served from a stale browser /
// CDN cache (and the installer always sees the newer build). Bump on each release.
const APP_VERSION = '1.0.1';
const APP_APK = `/downloads/mobtranslate-app-${APP_VERSION}.apk`;
const KEYBOARD_APK = '/downloads/mobtranslate-keyboard.apk';

export default function DownloadPage() {
  return (
    <SharedLayout>
      <div className="max-w-3xl mx-auto py-10 md:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-primary,#B45E2A)] mb-2">Android app</p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-balance">Get Mob Translate on your phone</h1>
        <p className="text-lg text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          Translate, look up words, hear how they sound, record your own language, and type it
          anywhere with the built-in keyboard. Made simple — for everyone, including Elders.
        </p>

        {/* Primary download */}
        <a
          href={APP_APK}
          download
          className="mt-7 inline-flex items-center gap-3 rounded-xl bg-primary text-primary-foreground px-6 h-14 text-lg font-bold shadow-sm hover:shadow-md transition-shadow"
        >
          <Download className="h-5 w-5" /> Download the app (.apk)
        </a>
        <p className="text-sm text-muted-foreground mt-2">Android · version {APP_VERSION}. Tap the file after it downloads to install — it updates any older version in place.</p>

        {/* What's inside */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
          {[
            { icon: ArrowRight, t: 'Translate & look up', d: 'English ↔ language, with meanings and examples.' },
            { icon: Mic, t: 'Record your language', d: 'Add a sentence and record it in a few big taps.' },
            { icon: Keyboard, t: 'Language keyboard', d: 'Type your language in any app, with the special letters.' },
            { icon: Smartphone, t: 'Hear it', d: 'Tap any word to hear it spoken aloud.' },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border p-4 flex gap-3">
              <f.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{f.t}</p>
                <p className="text-sm text-muted-foreground">{f.d}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Install steps */}
        <h2 className="text-xl font-semibold mt-12 mb-3">How to install</h2>
        <ol className="space-y-2">
          {[
            'Tap “Download the app” above. Open the downloaded file.',
            'If your phone asks, allow installing apps from your browser, then tap Install.',
            'Open Mob Translate. To use the keyboard, go to the Keyboard tab and follow the two steps.',
          ].map((s, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-border p-3">
              <span className="shrink-0 h-7 w-7 rounded-full bg-primary/15 text-primary grid place-items-center font-bold tabular-nums">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>

        {/* Extras */}
        <div className="mt-12 rounded-xl bg-muted/50 border border-dashed border-border p-5">
          <div className="flex items-center gap-2 mb-2">
            <Keyboard className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Just want the keyboard?</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            The app already includes a language keyboard. If you’d prefer the full standalone
            keyboard (built on the open-source HeliBoard), you can install that instead.
          </p>
          <a href={KEYBOARD_APK} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 h-10 text-sm font-medium hover:bg-muted">
            <Download className="h-4 w-4" /> Keyboard only (.apk)
          </a>
        </div>

        <p className="text-sm text-muted-foreground mt-8 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Coming to Google Play soon. <Link href="/privacy" className="text-primary hover:underline">Privacy</Link>
        </p>
      </div>
    </SharedLayout>
  );
}
