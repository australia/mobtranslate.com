'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import {
  Button,
  Textarea,
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from '@mobtranslate/ui';
import { useAuth } from '@/contexts/AuthContext';

interface TranslationCorrectionDialogProps {
  /** The target language code the translation was produced for. */
  languageCode: string;
  /** The English source text that was translated. */
  sourceText: string;
  /** The translation currently shown to the user (optional). */
  currentTranslation?: string;
  /** Optional className for the trigger button. */
  triggerClassName?: string;
  /** Optional label override for the trigger. */
  triggerLabel?: string;
}

/**
 * Unobtrusive "Suggest a better translation" affordance for free (non-word)
 * translations such as the homepage hero translator. Posts to
 * `/api/v2/translation-corrections`. Signed-out users are prompted to sign in.
 *
 * Fire-and-forget friendly: never interferes with the translate UX — it only
 * opens its own dialog on click.
 */
export function TranslationCorrectionDialog({
  languageCode,
  sourceText,
  currentTranslation,
  triggerClassName,
  triggerLabel = 'Suggest a better translation',
}: TranslationCorrectionDialogProps) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [suggested, setSuggested] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSuggested('');
    setReason('');
    setError(null);
    setDone(false);
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Reset shortly after close so the user doesn't see it clear mid-animation.
      setTimeout(reset, 200);
    }
  };

  const handleSubmit = async () => {
    if (!suggested.trim()) {
      setError('Please enter your suggested translation.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/translation-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          languageCode,
          sourceText,
          currentTranslation: currentTranslation ?? null,
          suggestedTranslation: suggested.trim(),
          reason: reason.trim() || null,
        }),
      });
      if (res.status === 401) {
        setError('Please sign in to send a suggestion.');
        return;
      }
      if (!res.ok) {
        throw new Error('Request failed');
      }
      setDone(true);
    } catch {
      setError('Could not send your suggestion. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          'inline-flex items-center gap-1.5 text-[rgba(255,255,255,0.7)] underline underline-offset-2 hover:text-white transition-colors'
        }
      >
        <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
        {triggerLabel}
      </button>

      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup size="md">
          <DialogTitle>Suggest a better translation</DialogTitle>
          <DialogDescription>
            Your suggestion is sent to the language keepers to review. Thank you for
            helping keep the language strong.
          </DialogDescription>

          {/* Show what's being corrected */}
          <div className="mt-4 rounded-lg bg-muted/50 border border-border p-3 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">English:</span> {sourceText}
            </p>
            {currentTranslation && (
              <p className="text-muted-foreground mt-1">
                <span className="font-medium text-foreground">Current:</span>{' '}
                {currentTranslation}
              </p>
            )}
          </div>

          {done ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-foreground">
                Thank you — sent to the language keepers to review.
              </p>
              <div className="flex justify-end">
                <Button onClick={() => handleOpenChange(false)}>Close</Button>
              </div>
            </div>
          ) : !loading && !user ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Please sign in to suggest a correction. It only takes a moment.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Link href="/auth/signin">
                  <Button>Sign in</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="tc-suggested" className="text-sm font-medium">
                  Your suggested translation
                </label>
                <Textarea
                  id="tc-suggested"
                  value={suggested}
                  onChange={(e) => setSuggested(e.target.value)}
                  placeholder="Enter the correct translation…"
                  className="min-h-[90px]"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="tc-reason" className="text-sm font-medium">
                  Reason <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  id="tc-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this better? Any source or context…"
                  className="min-h-[70px]"
                />
              </div>

              {error && (
                <p className="text-sm text-error" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send suggestion'}
                </Button>
              </div>
            </div>
          )}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
