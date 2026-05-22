export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Geo endpoint for language detection
    if (url.pathname === '/geo') {
      const country = request.cf?.country || 'US';
      return new Response(JSON.stringify({ country }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Static assets and well-known files: always pass through to ASSETS
    // (prevents SPA catch-all from serving text/html for these paths)
    if (
      url.pathname.startsWith('/.well-known/') ||
      url.pathname === '/llms.txt' ||
      url.pathname === '/robots.txt' ||
      url.pathname === '/sitemap.xml' ||
      /\.(json|txt|xml|png|svg|ico|jpg|jpeg|gif|webp|pdf|webmanifest|css|js|woff2|woff|ttf|otf)$/i.test(url.pathname)
    ) {
      return env.ASSETS.fetch(request);
    }

    // Serve static assets from Pages (SPA fallback)
    return env.ASSETS.fetch(request);
  },
};
