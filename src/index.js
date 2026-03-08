export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers corregidos (SIN ESPACIOS AL FINAL)
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

    // OAuth callback
    if (url.pathname === '/auth/callback' && request.method === 'POST') {
      try {
        const { code } = await request.json();
        if (!code) {
          return new Response(JSON.stringify({ error: 'Missing code' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // URL corregida (SIN ESPACIOS)
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: 'https://regapp-frontend.pages.dev', // Corregido
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

        const stmt = env.regapp_db.prepare(
          'INSERT INTO categories (name, user_id) VALUES (?, ?)'
        );
        const result = await stmt.bind(name.trim(), userId).run();
        const lastRowId = result.meta.last_row_id;

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

    // Endpoint: GET /api/categories (AGREGADO)
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

        const categories = await env.regapp_db.prepare(
          'SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC'
        ).bind(userId).all();

        return new Response(JSON.stringify({ success: true, data: categories.results }), {
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
    // Endpoint: GET /api/contacts
    if (url.pathname === '/api/contacts' && request.method === 'GET') {
      try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'Token de autenticación requerido' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const userId = 'temp-user-id';

        // Obtener todos los contactos del usuario con su categoría
        const contacts = await env.regapp_db.prepare(`
          SELECT c.*, cat.name as category_name
          FROM contacts c
          LEFT JOIN categories cat ON c.category_id = cat.id
          WHERE c.user_id = ?
          ORDER BY c.created_at DESC
        `).bind(userId).all();

        return new Response(JSON.stringify({ success: true, data: contacts.results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        console.error('Error al obtener contactos:', error);
        return new Response(JSON.stringify({ 
          error: error.message,
          stack: error.stack 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Endpoint: POST /api/contacts
if (url.pathname === '/api/contacts' && request.method === 'POST') {
  try {
    const body = await request.json();
    const { category_id, name, email, phone, notes } = body;

    if (!name || name.trim() === '') {
      return new Response(JSON.stringify({ error: 'El nombre del contacto es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (!category_id) {
      return new Response(JSON.stringify({ error: 'La categoría es requerida' }), {
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

    // Verificar que la categoría existe
    const categoryCheck = await env.regapp_db.prepare(
      'SELECT id FROM categories WHERE id = ? AND user_id = ?'
    ).bind(category_id, userId).first();

    if (!categoryCheck) {
      return new Response(JSON.stringify({ error: 'Categoría no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Insertar contacto
    const stmt = env.regapp_db.prepare(`
      INSERT INTO contacts (category_id, name, email, phone, notes, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = await stmt.bind(
      category_id,
      name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      notes?.trim() || null,
      userId
    ).run();

    const lastRowId = result.meta.last_row_id;

    // Obtener contacto recién creado
    const newContact = await env.regapp_db.prepare(`
      SELECT c.*, cat.name as category_name
      FROM contacts c
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.id = ?
    `).bind(lastRowId).first();

    return new Response(JSON.stringify({ success: true,  newContact }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al crear contacto:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Endpoint: PUT /api/contacts/:id
if (url.pathname.startsWith('/api/contacts/') && request.method === 'PUT') {
  try {
    // Extraer ID del path
    const id = url.pathname.split('/')[3];
    if (!id || isNaN(parseInt(id))) {
      return new Response(JSON.stringify({ error: 'ID de contacto inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const body = await request.json();
    const { category_id, name, email, phone, notes } = body;

    if (!name || name.trim() === '') {
      return new Response(JSON.stringify({ error: 'El nombre del contacto es requerido' }), {
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

    // Verificar que el contacto existe y pertenece al usuario
    const existingContact = await env.regapp_db.prepare(
      'SELECT id FROM contacts WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existingContact) {
      return new Response(JSON.stringify({ error: 'Contacto no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Si se proporciona category_id, verificar que exista
    if (category_id) {
      const categoryCheck = await env.regapp_db.prepare(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?'
      ).bind(category_id, userId).first();

      if (!categoryCheck) {
        return new Response(JSON.stringify({ error: 'Categoría no encontrada' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Actualizar contacto (SIN updated_at)
    const stmt = env.regapp_db.prepare(`
      UPDATE contacts
      SET 
        category_id = COALESCE(?, category_id),
        name = ?,
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        notes = COALESCE(?, notes)
      WHERE id = ? AND user_id = ?
    `);
    await stmt.bind(
      category_id || null,
      name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      notes?.trim() || null,
      id,
      userId
    ).run();

    // Obtener contacto actualizado
    const updatedContact = await env.regapp_db.prepare(`
      SELECT c.*, cat.name as category_name
      FROM contacts c
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.id = ?
    `).bind(id).first();

    return new Response(JSON.stringify({ success: true,  updatedContact }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Endpoint: DELETE /api/contacts/:id
if (url.pathname.startsWith('/api/contacts/') && request.method === 'DELETE') {
  try {
    // Extraer ID del path
    const id = url.pathname.split('/')[3];
    if (!id || isNaN(parseInt(id))) {
      return new Response(JSON.stringify({ error: 'ID de contacto inválido' }), {
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

    // Verificar que el contacto existe y pertenece al usuario
    const existingContact = await env.regapp_db.prepare(
      'SELECT id FROM contacts WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existingContact) {
      return new Response(JSON.stringify({ error: 'Contacto no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Eliminar contacto
    await env.regapp_db.prepare(
      'DELETE FROM contacts WHERE id = ? AND user_id = ?'
    ).bind(id, userId).run();

    return new Response(JSON.stringify({ success: true, message: 'Contacto eliminado correctamente' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al eliminar contacto:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
// Endpoint: GET /api/contacts/:id
if (url.pathname.startsWith('/api/contacts/') && request.method === 'GET') {
  try {
    // Extraer ID del path
    const id = url.pathname.split('/')[3];
    if (!id || isNaN(parseInt(id))) {
      return new Response(JSON.stringify({ error: 'ID de contacto inválido' }), {
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

    // Obtener contacto con su categoría
    const contact = await env.regapp_db.prepare(`
      SELECT c.*, cat.name as category_name
      FROM contacts c
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.id = ? AND c.user_id = ?
    `).bind(id, userId).first();

    if (!contact) {
      return new Response(JSON.stringify({ error: 'Contacto no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ success: true,  contact }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al obtener contacto:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Endpoint: PUT /api/categories/:id
if (url.pathname.startsWith('/api/categories/') && request.method === 'PUT') {
  try {
    // Extraer ID del path
    const id = url.pathname.split('/')[3];
    if (!id || isNaN(parseInt(id))) {
      return new Response(JSON.stringify({ error: 'ID de categoría inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

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
    const newName = name.trim();

    // Verificar que la categoría existe y pertenece al usuario
    const currentCategory = await env.regapp_db.prepare(
      'SELECT name FROM categories WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!currentCategory) {
      return new Response(JSON.stringify({ error: 'Categoría no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Si el nuevo nombre es diferente, verificar que no exista otra categoría con ese nombre
    if (newName !== currentCategory.name) {
      const duplicateCheck = await env.regapp_db.prepare(
        'SELECT id FROM categories WHERE name = ? AND user_id = ? AND id != ?'
      ).bind(newName, userId, id).first();

      if (duplicateCheck) {
        return new Response(JSON.stringify({ error: 'Ya existe una categoría con ese nombre' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Actualizar categoría
    await env.regapp_db.prepare(
      'UPDATE categories SET name = ? WHERE id = ? AND user_id = ?'
    ).bind(newName, id, userId).run();

    // Obtener categoría actualizada
    const updatedCategory = await env.regapp_db.prepare(
      'SELECT * FROM categories WHERE id = ?'
    ).bind(id).first();

    return new Response(JSON.stringify({ success: true,  updatedCategory }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
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