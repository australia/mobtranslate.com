'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from '@mobtranslate/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ImprovementSuggestionForm } from './ImprovementSuggestionForm';

interface WordCorrectionActionProps {
  wordId: string;
  word: string;
  definition?: string;
  translation?: string;
}

/**
 * "Suggest a correction" action for a public word detail page.
 *
 * - Signed-in users get the full {@link ImprovementSuggestionForm} (correct the
 *   definition, translation, example, pronunciation, grammar, or cultural context),
 *   which posts to `POST /api/v2/words/{id}/improvements`.
 * - Signed-out users see a button that prompts them to sign in first.
 */
export function WordCorrectionAction({ wordId, word, definition, translation }: WordCorrectionActionProps) {
  const { user, loading } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);

  // While auth state resolves, or when signed in, show the real form.
  if (loading || user) {
    return (
      <ImprovementSuggestionForm
        wordId={wordId}
        wordData={{ word, definition, translation }}
      />
    );
  }

  // Signed out — prompt to sign in.
  return (
    <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
      <button
        type="button"
        onClick={() => setSignInOpen(true)}
        className="mt-btn mt-btn-outline mt-btn-md gap-2"
      >
        <Lightbulb className="h-4 w-4" aria-hidden="true" />
        Suggest a correction
      </button>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup size="sm">
          <DialogTitle>Suggest a correction</DialogTitle>
          <DialogDescription>
            Please sign in to suggest a correction for “{word}”. Your suggestion is
            sent to the language keepers to review.
          </DialogDescription>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={() => setSignInOpen(false)}>
              Cancel
            </Button>
            <Link href="/auth/signin">
              <Button>Sign in</Button>
            </Link>
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
