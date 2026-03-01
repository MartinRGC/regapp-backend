export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers para todas las respuestas
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://regapp-frontend.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

    // Manejar preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // OAuth callback: ahora acepta POST con JSON { code: "..." }
    if (url.pathname === '/auth/callback' && request.method === 'POST') {
      try {
        const { code } = await request.json();
        if (!code) {
          return new Response(JSON.stringify({ error: 'Missing code' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Intercambiar code por token (¡sin espacios en la URL!)
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: 'https://regapp-frontend.pages.dev', // ✅ Corregido
            grant_type: 'authorization_code'
          })
        });

        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
          return new Response(JSON.stringify({ 
            token: tokenData.access_token.substring(0, 10) + '...',
            expires_in: tokenData.expires_in
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } else {
          return new Response(JSON.stringify({ error: 'Token exchange failed', details: tokenData }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    // Endpoint: POST /api/categories
if (url.pathname === '/api/categories' && request.method === 'POST') {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || name.trim() === '') {
      return new Response(JSON.stringify({ error: 'El nombre de la categoría es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autenticación requerido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const userId = 'temp-user-id';

    // Insertar categoría
    const stmt = env.regapp_db.prepare(
      'INSERT INTO categories (name, user_id) VALUES (?, ?)'
    );
    const result = await stmt.bind(name.trim(), userId).run();

    // CORREGIDO: usar result.meta.last_row_id (sintaxis D1)
    const lastRowId = result.meta.last_row_id;

    // Obtener categoría recién creada
    const newCategory = await env.regapp_db.prepare(
      'SELECT * FROM categories WHERE id = ?'
    ).bind(lastRowId).first();

    return new Response(JSON.stringify({ success: true, data: newCategory }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al crear categoría:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Endpoint: GET /api/categories
if (url.pathname === '/api/categories' && request.method === 'GET') {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autenticación requerido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const userId = 'temp-user-id';

    // Obtener todas las categorías del usuario
    const categories = await env.regapp_db.prepare(
      'SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC'
    ).bind(userId).all();

    return new Response(JSON.stringify({ success: true,  categories.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}




    // Ruta raíz
    return new Response('RegApp Contacts API', { 
      status: 200,
      headers: corsHeaders 
    });
  },
};