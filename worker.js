// ============================================================
//  Metrognome — Spotify API proxy (Cloudflare Worker)
//  Deploy at: https://workers.cloudflare.com (free)
//
//  Set these two Environment Variables in the Worker dashboard:
//    SPOTIFY_CLIENT_ID     — from Spotify Developer Dashboard
//    SPOTIFY_CLIENT_SECRET — from Spotify Developer Dashboard
// ============================================================

export default {
  async fetch(request, env) {

    // Allow your GitHub Pages site (and localhost for testing)
    const allowedOrigins = [
      'https://YOUR_GITHUB_USERNAME.github.io',  // ← update this
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ];

    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query param ?q=' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      // ── Step 1: Get Spotify access token ──────────────────
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
        },
        body: 'grant_type=client_credentials',
      });

      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;

      if (!token) throw new Error('Failed to get Spotify token');

      // ── Step 2: Search for the track ──────────────────────
      const searchRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const searchData = await searchRes.json();
      const track = searchData.tracks?.items?.[0];

      if (!track) {
        return new Response(JSON.stringify({ error: 'Song not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── Step 3: Get audio features (BPM + time signature) ─
      const featuresRes = await fetch(
        `https://api.spotify.com/v1/audio-features/${track.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const features = await featuresRes.json();

      // ── Step 4: Return clean response ─────────────────────
      const result = {
        title:          track.name,
        artist:         track.artists.map(a => a.name).join(', '),
        album:          track.album.name,
        bpm:            Math.round(features.tempo),
        time_signature: features.time_signature, // integer, e.g. 4
        key:            features.key,            // 0–11, Spotify pitch class
        mode:           features.mode,           // 1=major, 0=minor
        spotify_url:    track.external_urls.spotify,
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};
