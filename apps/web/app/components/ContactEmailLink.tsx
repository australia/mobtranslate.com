'use client';

import { useEffect, useState } from 'react';

const LOCAL_PART = ['aj', 'ax'].join('');
const DOMAIN = ['mob', 'translate.com'].join('');
const ACCESSIBLE_LABEL = 'Email ajax@mobtranslate.com';

interface ContactEmailLinkProps {
  className?: string;
}

export function ContactEmailLink({ className }: ContactEmailLinkProps) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return <span className={className}>ajax [at] mobtranslate.com</span>;
  }

  return (
    <a
      href={`mailto:${LOCAL_PART}@${DOMAIN}`}
      className={className}
      aria-label={ACCESSIBLE_LABEL}
    >
      {LOCAL_PART}
      <span aria-hidden="true">@</span>
      {DOMAIN}
    </a>
  );
}
