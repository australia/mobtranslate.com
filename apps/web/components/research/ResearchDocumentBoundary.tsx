'use client';

import { ReactNode, useEffect, useState } from 'react';

export const RESEARCH_PATH_PREFIX = '/admin/research';

/**
 * Research pages must run in a document that was loaded inside the research
 * section and has never run analytics. The public site loads Google Analytics,
 * and a client-side navigation from there would keep that script running beside
 * restricted evidence. Otherwise, reload from the server (where analytics is not
 * rendered) before mounting any research content.
 */
function documentIsClean(): boolean {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  const documentPath = entry ? new URL(entry.name).pathname : '';
  if (!documentPath.startsWith(RESEARCH_PATH_PREFIX)) return false;
  if ('dataLayer' in window || 'gtag' in window) return false;
  return document.querySelector('script[src*="googletagmanager"]') === null;
}

export default function ResearchDocumentBoundary({ children }: { children: ReactNode }) {
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (documentIsClean()) {
      setVerified(true);
    } else {
      window.location.replace(window.location.href);
    }
  }, []);

  return verified ? <>{children}</> : null;
}
