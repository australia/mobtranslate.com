import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private / interactive / per-user areas — keep out of the index.
      disallow: [
        '/admin', '/auth/', '/curator/', '/api/', '/record',
        '/dashboard', '/settings', '/my-likes', '/chat', '/voice',
        '/contributions', '/onboarding', '/speak',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
