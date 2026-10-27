import type { Metadata } from 'next';

/**
 * One place for what search engines and link previews see. Every public page
 * builds its metadata with `pageMetadata`, so each one gets its own canonical
 * URL, title and description on X, Facebook, LinkedIn and chat apps, and the
 * share card, instead of inheriting the homepage's.
 */
export const SITE_URL = 'https://mobtranslate.com';
export const SITE_NAME = 'Mob Translate';
export const SITE_TITLE = 'Mob Translate — Indigenous language dictionaries, translation & voice';
export const SITE_DESCRIPTION =
  "Open dictionaries, translation and voice for Indigenous languages: Kuku Yalanji, Wajarri and Anindilyakwa from Australia, and Mi'gmaq. Every entry carries its source.";
export const X_HANDLE = '@ajaxdavis';

/** The share card. A new file name when it changes, because X keeps cards for about a week. */
export const SHARE_IMAGE = {
  url: '/og/mobtranslate-2026-10.jpg',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
  alt: "Mob Translate: translate into Indigenous languages. A map of Australia marks bubu, Kuku Yalanji for a person's Country, and barna, Wajarri for ground, earth, country.",
};

type PageMetadataInput = {
  /** The page's own title; the layout adds "| Mob Translate" in the browser tab. */
  title: string;
  description: string;
  /** Path from the site root, used for the canonical URL and og:url. */
  path: string;
  /** Use the title as it is, without the site name after it. */
  absoluteTitle?: boolean;
  type?: 'website' | 'article';
  /** Keep the page out of search results (it can still be shared). */
  noindex?: boolean;
};

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  type = 'website',
  noindex = false,
}: PageMetadataInput): Metadata {
  const shareTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      url: path,
      siteName: SITE_NAME,
      locale: 'en_AU',
      title: shareTitle,
      description,
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      site: X_HANDLE,
      creator: X_HANDLE,
      title: shareTitle,
      description,
      images: [{ url: SHARE_IMAGE.url, alt: SHARE_IMAGE.alt }],
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** For pages behind sign-in, or links meant for one person: no search, no canonical. */
export const privatePage = (title: string, description?: string): Metadata => ({
  title,
  ...(description ? { description } : {}),
  robots: { index: false, follow: false },
});
