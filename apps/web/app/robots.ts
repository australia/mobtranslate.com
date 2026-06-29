import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private / interactive / per-user areas — keep out of the index.
      disallow: [
        '/admin/', '/auth/', '/curator/', '/api/', '/record/',
        '/dashboard', '/settings', '/my-likes', '/chat', '/voice',
        '/contributions', '/onboarding',
      ],
    },
    sitemap: 'https://mobtranslate.com/sitemap.xml',
    host: 'https://mobtranslate.com',
  };
}
