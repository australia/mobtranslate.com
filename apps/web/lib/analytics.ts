/**
 * Google Analytics 4 (gtag.js) — a tiny, safe wrapper.
 *
 * `track()` is a no-op anywhere gtag isn't loaded (SSR, ad-blockers, missing id),
 * so it can be sprinkled across the app without guards or try/catch at the call
 * site. The GA tag itself is injected once by <GoogleAnalytics/> in the root
 * layout, which also fires page_view on client-side route changes (gtag does not
 * do that on its own in a SPA).
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-RTRR10NJNV';

export type GtagParams = Record<string, string | number | boolean | undefined | null>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Send a GA4 event. Silently does nothing if analytics isn't available. */
export function track(event: string, params?: GtagParams): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', event, params ?? {});
  } catch {
    /* never let analytics break the app */
  }
}

/** Fire a manual page_view (used by the route tracker on SPA navigations). */
export function trackPageview(url: string): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', 'page_view', {
      page_path: url,
      page_location: window.location.href,
      page_title: document.title,
    });
  } catch {
    /* no-op */
  }
}
