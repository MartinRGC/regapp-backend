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

    // Obtener parámetros de búsqueda y filtros
    const search = url.searchParams.get('search'); // Buscar en name, email, phone
    const categoryId = url.searchParams.get('category_id'); // Filtrar por categoría
    const limit = parseInt(url.searchParams.get('limit')) || 100; // Límite de resultados
    const offset = parseInt(url.searchParams.get('offset')) || 0; // Desplazamiento (paginación)

    // Construir consulta dinámicamente
    let query = `
      SELECT c.*, cat.name as category_name
      FROM contacts c
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.user_id = ?
    `;
    let params = [userId];

    // Aplicar filtro de búsqueda
    if (search) {
      query += ` AND (
        c.name LIKE ? OR
        c.email LIKE ? OR
        c.phone LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Aplicar filtro por categoría
    if (categoryId && !isNaN(parseInt(categoryId))) {
      query += ` AND c.category_id = ?`;
      params.push(parseInt(categoryId));
    }

    // Ordenar y limitar resultados
    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Ejecutar consulta
    const contacts = await env.regapp_db.prepare(query).bind(...params).all();

    // Contar total de resultados (sin límite)
    let countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      WHERE c.user_id = ?
    `;
    let countParams = [userId];

    if (search) {
      countQuery += ` AND (
        c.name LIKE ? OR
        c.email LIKE ? OR
        c.phone LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }

    if (categoryId && !isNaN(parseInt(categoryId))) {
      countQuery += ` AND c.category_id = ?`;
      countParams.push(parseInt(categoryId));
    }

    const countResult = await env.regapp_db.prepare(countQuery).bind(...countParams).first();
    const total = countResult.total;

    return new Response(JSON.stringify({ 
      success: true, 
      data: contacts.results,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + contacts.results.length < total
      }
    }), {
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

// POST /api/contacts - Crear contacto
if (request.method === 'POST' && pathname === '/api/contacts') {
  try {
    const body = await request.json();
    const { name, email, phone, category_id, extra_data } = body;

    // Validación básica
    if (!name || !category_id) {
      return error(400, 'Faltan campos requeridos (name, category_id)');
    }

    // Validar que extra_data sea un objeto (o undefined)
    let extraDataJson = '{}';
    if (extra_data && typeof extra_data === 'object') {
      extraDataJson = JSON.stringify(extra_data);
    }

    // Insertar contacto
    const result = await env.regapp_db.prepare(`
      INSERT INTO contacts (name, email, phone, category_id, user_id, extra_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      name,
      email || null,
      phone || null,
      category_id,
      userId,
      extraDataJson
    ).run();

    return success({
      id: result.lastRowId,
      name,
      email,
      phone,
      category_id,
      extra_data: extra_data || {},
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al crear contacto:', error);
    return error(500, 'Error al crear contacto');
  }
}

// PUT /api/contacts/:id - Actualizar contacto
if (request.method === 'PUT' && pathname.startsWith('/api/contacts/')) {
  try {
    const id = pathname.split('/')[3];
    
    // Validar que el ID sea un número
    if (!id || isNaN(id)) {
      return error(400, 'ID de contacto inválido');
    }

    const body = await request.json();
    const { name, email, phone, category_id, extra_data } = body;

    // Validación básica
    if (!name && !email && !phone && !category_id && !extra_data) {
      return error(400, 'No hay datos para actualizar');
    }

    // Construir la consulta dinámicamente
    const updates = [];
    const values = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (category_id !== undefined) {
      updates.push('category_id = ?');
      values.push(category_id);
    }
    if (extra_data !== undefined && typeof extra_data === 'object') {
      updates.push('extra_data = ?');
      values.push(JSON.stringify(extra_data));
    }
    
    // Agregar user_id y id al final
    values.push(userId, id);

    // Ejecutar actualización
    const result = await env.regapp_db.prepare(`
      UPDATE contacts 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(...values).run();

    // Verificar si se actualizó algún registro
    if (result.changes === 0) {
      return error(404, 'Contacto no encontrado o no autorizado');
    }

    // Obtener el contacto actualizado
    const updatedContact = await env.regapp_db.prepare(`
      SELECT * FROM contacts WHERE id = ? AND user_id = ?
    `).bind(id, userId).first();

    return success({
      id: updatedContact.id,
      name: updatedContact.name,
      email: updatedContact.email,
      phone: updatedContact.phone,
      category_id: updatedContact.category_id,
      extra_data: updatedContact.extra_data ? JSON.parse(updatedContact.extra_data) : {},
      created_at: updatedContact.created_at,
      updated_at: updatedContact.updated_at
    });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);
    return error(500, 'Error al actualizar contacto');
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

// Endpoint: DELETE /api/categories/:id
if (url.pathname.startsWith('/api/categories/') && request.method === 'DELETE') {
  try {
    // Extraer ID del path
    const id = url.pathname.split('/')[3];
    if (!id || isNaN(parseInt(id))) {
      return new Response(JSON.stringify({ error: 'ID de categoría inválido' }), {
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

    // Verificar que la categoría existe y pertenece al usuario
    const existingCategory = await env.regapp_db.prepare(
      'SELECT id, name FROM categories WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (!existingCategory) {
      return new Response(JSON.stringify({ error: 'Categoría no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Verificar si la categoría tiene contactos asociados
    const contactCount = await env.regapp_db.prepare(
      'SELECT COUNT(*) as count FROM contacts WHERE category_id = ? AND user_id = ?'
    ).bind(id, userId).first();

    if (contactCount.count > 0) {
      return new Response(JSON.stringify({ 
        error: 'No se puede eliminar la categoría porque tiene contactos asociados',
        contact_count: contactCount.count
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Eliminar categoría
    await env.regapp_db.prepare(
      'DELETE FROM categories WHERE id = ? AND user_id = ?'
    ).bind(id, userId).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Categoría "${existingCategory.name}" eliminada correctamente` 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error al eliminar categoría:', error);
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