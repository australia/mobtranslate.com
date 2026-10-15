const originHost = 'mobtranslate.com';
const originPrefix = '/_design-system-origin';

export default {
  async fetch(request) {
    const publicUrl = new URL(request.url);
    const originUrl = new URL(request.url);
    originUrl.protocol = 'https:';
    originUrl.hostname = originHost;
    originUrl.pathname = originPrefix + publicUrl.pathname;
    const forwarded = new Request(originUrl, request);
    forwarded.headers.delete('cookie');
    forwarded.headers.delete('authorization');
    const response = await fetch(forwarded, { redirect: 'manual' });
    const headers = new Headers(response.headers);
    headers.delete('set-cookie');
    const location = headers.get('location');
    if (location) {
      const target = new URL(location, originUrl);
      if (target.hostname === originHost) {
        target.host = publicUrl.host;
        target.protocol = publicUrl.protocol;
        if (target.pathname.startsWith(originPrefix + '/')) {
          target.pathname = target.pathname.slice(originPrefix.length);
        }
        headers.set('location', target.href);
      }
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
