'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyBlockProps {
  /** The exact text to copy (also rendered verbatim). */
  text: string;
  /** Accessible label for the copy control. */
  label: string;
}

/**
 * A selectable, copy-pasteable code block with a keyboard-operable copy button.
 * Server components render the citation text; this only adds the convenience
 * button (the text is always selectable regardless of JS).
 */
export default function CopyBlock({ text, label }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — text is still selectable */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {copied ? <Check size={13} className="text-secondary" /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 pr-20 text-[12.5px] leading-relaxed text-foreground">
        <code className="whitespace-pre-wrap break-words">{text}</code>
      </pre>
    </div>
  );
}
