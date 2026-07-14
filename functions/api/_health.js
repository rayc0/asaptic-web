// Trivial route function so Pages activates the Functions runtime (and thus the
// root _middleware) on this otherwise-static site. Gated by _middleware anyway.
export async function onRequest() {
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}
