export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // OAuth callback
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('Missing code', { status: 400 });
      }

      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: 'http://localhost:3000/auth/callback',
            grant_type: 'authorization_code'
          })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          return new Response(JSON.stringify({ token: tokenData.access_token.substring(0, 10) + '...' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          return new Response(JSON.stringify(tokenData), { status: 400 });
        }
      } catch (err) {
        return new Response(err.message, { status: 500 });
      }
    }

    return new Response('RegApp Contacts API', { status: 200 });
  },
};