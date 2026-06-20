'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Download, Mic, Clock, AlertTriangle, FileText } from 'lucide-react';
import { Button, cn } from '@mobtranslate/ui';
import { fetchCorpusStats, fetchExport, type CorpusStats, type ExportItem } from './api';

interface CorpusDashboardProps {
  languageId: string;
  languageCode: string;
  speakerId: string | null;
  speakerName: string | null;
  refreshKey: number;
}

// Approximate Kuku Yalanji orthographic units, for coverage tracking.
const GRAPHEMES = ['ng', 'ny', 'rr', 'aa', 'ii', 'uu', 'a', 'i', 'u', 'b', 'd', 'g', 'j', 'k', 'l', 'm', 'n', 'r', 'w', 'y'];

function tokenizeGraphemes(text: string): string[] {
  const s = text.toLowerCase();
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    const two = s.slice(i, i + 2);
    if (['ng', 'ny', 'rr', 'aa', 'ii', 'uu'].includes(two)) {
      out.push(two);
      i += 2;
    } else {
      const c = s[i];
      if (/[a-z]/.test(c)) out.push(c);
      i += 1;
    }
  }
  return out;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function triggerDownload(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CorpusDashboard({ languageId, languageCode, speakerId, speakerName, refreshKey }: CorpusDashboardProps) {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [items, setItems] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [speakerOnly, setSpeakerOnly] = useState(false);

  const scope = speakerOnly && speakerId ? speakerId : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, ex] = await Promise.all([fetchCorpusStats(languageId, scope), fetchExport(languageId, scope)]);
      setStats(s);
      setItems(ex.items);
    } catch {
      setStats(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [languageId, scope]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Grapheme coverage from recorded transcripts.
  const counts = new Map<string, number>();
  for (const it of items) for (const g of tokenizeGraphemes(it.text)) counts.set(g, (counts.get(g) ?? 0) + 1);
  const covered = GRAPHEMES.filter((g) => (counts.get(g) ?? 0) > 0).length;
  const gaps = GRAPHEMES.filter((g) => (counts.get(g) ?? 0) === 0);

  const totalSec = stats?.total_seconds ?? 0;
  // A rough "usable single-speaker voice" milestone is ~1 hour; ~5h for a good one.
  const hourPct = Math.min(100, Math.round((totalSec / 3600) * 100));

  const exportDataset = () => {
    if (items.length === 0) return;
    const slug = `${languageCode}${scope ? '_' + (speakerName ?? 'speaker').replace(/\W+/g, '_').toLowerCase() : ''}`;
    // LJSpeech-style metadata: id|transcript|normalized
    const csv = items.map((i) => `${i.id}|${i.text.replace(/[|\n]/g, ' ')}|${i.normalized.replace(/[|\n]/g, ' ')}`).join('\n');
    const urls = items.map((i) => `${i.url}\t${i.file}`).join('\n');
    const sh = [
      '#!/usr/bin/env bash',
      '# Kuku Yalanji TTS dataset preparation — downloads master WAVs into wavs/',
      '# and writes an LJSpeech-style metadata.csv. Requires curl (+ ffmpeg to resample).',
      'set -euo pipefail',
      `DATASET="${slug}"`,
      'mkdir -p "$DATASET/wavs"',
      `cat > "$DATASET/metadata.csv" <<'CSV'`,
      csv,
      'CSV',
      `cat > "$DATASET/urls.tsv" <<'URLS'`,
      urls,
      'URLS',
      'while IFS=$\'\\t\' read -r url file; do',
      '  [ -n "$url" ] && curl -fsSL "$url" -o "$DATASET/wavs/$file"',
      'done < "$DATASET/urls.tsv"',
      `echo "Downloaded $(ls "$DATASET/wavs" | wc -l) clips into $DATASET/wavs"`,
      '# Optional: resample to 22.05kHz mono for Piper/VITS:',
      '# for f in "$DATASET"/wavs/*.wav; do ffmpeg -y -i "$f" -ar 22050 -ac 1 "${f%.wav}.22k.wav" && mv "${f%.wav}.22k.wav" "$f"; done',
      '',
    ].join('\n');
    triggerDownload(`${slug}_prepare.sh`, sh, 'text/x-shellscript');
  };

  if (loading && !stats) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const buckets = stats
    ? [
        { label: '<1s', n: stats.b_lt1, warn: true },
        { label: '1–3s', n: stats.b_1_3 },
        { label: '3–10s', n: stats.b_3_10 },
        { label: '10–30s', n: stats.b_10_30 },
        { label: '>30s', n: stats.b_gt30, warn: true },
      ]
    : [];
  const bucketMax = Math.max(1, ...buckets.map((b) => b.n));

  return (
    <div className="h-full space-y-4 overflow-y-auto">
      {speakerId && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={speakerOnly} onChange={(e) => setSpeakerOnly(e.target.checked)} className="h-4 w-4" />
          Only {speakerName ?? 'selected speaker'} (a TTS voice is trained on one speaker)
        </label>
      )}

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Clock} label="Recorded" value={fmtDuration(totalSec)} sub={`${stats?.total_recordings ?? 0} clips`} />
        <Stat icon={Mic} label="Speakers" value={String(stats?.distinct_speakers ?? 0)} sub={`${stats?.sentence_recordings ?? 0} sentences`} />
      </div>

      {/* Progress toward a usable voice */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">Toward a usable voice (~1h)</span>
          <span className="text-sm text-muted-foreground">{fmtDuration(totalSec)} / 1h</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-[var(--color-secondary)] transition-all" style={{ width: `${hourPct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">~1h gets a basic voice · ~5h gets a good one. Words: {stats?.word_recordings ?? 0} · phrases: {stats?.phrase_recordings ?? 0}.</p>
      </div>

      {/* Length distribution */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium text-foreground">Clip length distribution</p>
        <div className="flex items-end gap-2" style={{ height: 80 }}>
          {buckets.map((b) => (
            <div key={b.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs text-muted-foreground">{b.n}</span>
              <div className={cn('w-full rounded-t', b.warn ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-secondary)]')} style={{ height: `${(b.n / bucketMax) * 56}px` }} />
              <span className="text-[10px] text-muted-foreground">{b.label}</span>
            </div>
          ))}
        </div>
        {(!!stats?.too_short || !!stats?.too_long || !!stats?.clipped_count) && (
          <p className="mt-2 flex items-center gap-1 text-xs text-[var(--color-warning)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {stats?.too_short ? `${stats.too_short} too short` : ''} {stats?.too_long ? `· ${stats.too_long} too long` : ''} {stats?.clipped_count ? `· ${stats.clipped_count} clipped` : ''}
          </p>
        )}
      </div>

      {/* Grapheme coverage */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">Sound coverage (approx)</span>
          <span className="text-sm text-muted-foreground">{covered}/{GRAPHEMES.length}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {GRAPHEMES.map((g) => {
            const n = counts.get(g) ?? 0;
            return (
              <span key={g} title={`${n} occurrences`} className={cn('rounded px-1.5 py-0.5 font-mono text-xs', n === 0 ? 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]' : n < 5 ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]' : 'bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]')}>
                {g}
              </span>
            );
          })}
        </div>
        {gaps.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Missing: {gaps.join(', ')} — record words/sentences containing these.</p>}
      </div>

      {/* Export */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Training dataset</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {items.length} clips · {fmtDuration(totalSec)}. Exports an LJSpeech-style <code>metadata.csv</code> + a script that downloads the master WAVs (for Piper / VITS / XTTS).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={exportDataset} disabled={items.length === 0}>
            Export prepare script
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<FileText className="h-4 w-4" />}
            disabled={items.length === 0}
            onClick={() =>
              triggerDownload(
                `${languageCode}_metadata.csv`,
                items.map((i) => `${i.id}|${i.text.replace(/[|\n]/g, ' ')}|${i.normalized.replace(/[|\n]/g, ' ')}`).join('\n'),
                'text/csv',
              )
            }
          >
            metadata.csv only
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
