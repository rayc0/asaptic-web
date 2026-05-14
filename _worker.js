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

    // Pass everything else through
    return fetch(request);
  },
};
