'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { GA_ID, trackPageview } from '@/lib/analytics';

/**
 * Tracks page_view on client-side route changes. GA's initial config fires the
 * first pageview itself (send_page_view), so we skip the first mount here to
 * avoid double-counting, then fire on every subsequent navigation.
 */
function RouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const qs = searchParams?.toString();
    trackPageview(pathname + (qs ? `?${qs}` : ''));
  }, [pathname, searchParams]);

  return null;
}

/** Injects the GA4 tag once and tracks SPA navigations. No-op without a GA id. */
export function GoogleAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
      <Suspense fallback={null}>
        <RouteTracker />
      </Suspense>
    </>
  );
}

export default GoogleAnalytics;
