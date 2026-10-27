/**
 * API Serverless Function: Publicar Precios en Catálogo Web (GitHub Pages)
 * Protegido con verificación de Firebase Auth ID Token y lista blanca ALLOWED_EMAILS.
 */

export async function verificarTokenFirebase(idToken, apiKey) {
  if (!apiKey) {
    throw new Error('FIREBASE_API_KEY no está configurada en las variables de entorno del servidor');
  }

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Token inválido o expirado (${message})`);
  }

  const data = await res.json();
  const user = data.users && data.users[0];
  if (!user || !user.email) {
    throw new Error('No se encontró información de usuario para el token provisto');
  }

  return {
    email: user.email,
    emailVerified: Boolean(user.emailVerified)
  };
}

export default async function handler(req, res) {
  // 1. Validar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Validar encabezado Authorization (Bearer token)
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Encabezado Authorization con Bearer token requerido' });
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Token de autorización vacío' });
  }

  // 3. Verificar token con Firebase Auth REST API
  let usuario;
  try {
    if (req._mockVerifier) {
      // Soporte para pruebas automatizadas unitarias / dobles de prueba
      usuario = await req._mockVerifier(idToken);
    } else {
      const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
      usuario = await verificarTokenFirebase(idToken, apiKey);
    }
  } catch (authError) {
    console.warn('[PUBLICAR-API] Fallo de autenticación en token');
    return res.status(401).json({ error: 'Token de autorización inválido o expirado' });
  }

  // 4. Validar lista blanca ALLOWED_EMAILS y verificación de email
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS;
  if (!allowedEmailsEnv || typeof allowedEmailsEnv !== 'string' || !allowedEmailsEnv.trim()) {
    console.error('[PUBLICAR-API] Variable ALLOWED_EMAILS no configurada (fail closed)');
    return res.status(403).json({ error: 'Acceso denegado: lista de administradores no configurada en el servidor' });
  }

  const allowedList = allowedEmailsEnv.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (allowedList.length === 0) {
    console.error('[PUBLICAR-API] Lista ALLOWED_EMAILS vacía (fail closed)');
    return res.status(403).json({ error: 'Acceso denegado: sin usuarios autorizados' });
  }

  const emailNorm = String(usuario.email || '').toLowerCase().trim();
  const isVerified = usuario.emailVerified === true;

  if (!isVerified || !allowedList.includes(emailNorm)) {
    // Máscara de email para log seguro sin filtrar datos privados
    const masked = emailNorm.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '***' + c);
    console.warn(`[PUBLICAR-API] Acceso denegado para email ${masked} (verificado: ${isVerified})`);
    return res.status(403).json({ error: 'Acceso denegado: usuario no autorizado o email no verificado' });
  }

  // 5. Validar cuerpo de la solicitud (payload)
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Cuerpo de solicitud inválido: objeto esperado' });
  }

  // Limitar tamaño máximo del cuerpo
  try {
    if (JSON.stringify(req.body).length > 500000) {
      return res.status(400).json({ error: 'Cuerpo de solicitud excede el límite máximo permitido' });
    }
  } catch {
    return res.status(400).json({ error: 'Error procesando cuerpo de solicitud' });
  }

  const allowedKeys = ['contenido', 'dryRun'];
  const extraKeys = Object.keys(req.body).filter(k => !allowedKeys.includes(k));
  if (extraKeys.length > 0) {
    return res.status(400).json({ error: `Campos no permitidos en la solicitud: ${extraKeys.join(', ')}` });
  }

  const { contenido, dryRun } = req.body;
  if (!contenido || typeof contenido !== 'object' || Array.isArray(contenido)) {
    return res.status(400).json({ error: 'El campo "contenido" debe ser un objeto' });
  }

  if (typeof contenido.monto_minimo !== 'number' || isNaN(contenido.monto_minimo) || contenido.monto_minimo < 0) {
    return res.status(400).json({ error: 'monto_minimo inválido: debe ser un número mayor o igual a 0' });
  }

  if (!Array.isArray(contenido.productos) || contenido.productos.length === 0 || contenido.productos.length > 500) {
    return res.status(400).json({ error: 'productos debe ser un array con entre 1 y 500 elementos' });
  }

  for (let i = 0; i < contenido.productos.length; i++) {
    const p = contenido.productos[i];
    if (!p || typeof p !== 'object' || typeof p.nombre !== 'string' || !p.nombre.trim() || p.nombre.length > 100) {
      return res.status(400).json({ error: `Producto en índice ${i} inválido o nombre vacío/excesivo` });
    }
    if (typeof p.precio !== 'number' || isNaN(p.precio) || p.precio < 0) {
      return res.status(400).json({ error: `Precio inválido en producto en índice ${i}` });
    }
  }

  // 6. Modo dry-run para pruebas seguras sin modificar repositorio externo
  if (dryRun) {
    console.log('[PUBLICAR-API] Modo dry-run: autorización y validación exitosas. Commit omitido.');
    return res.status(200).json({ success: true, dryRun: true, message: 'Validación y autorización exitosas' });
  }

  // 7. Token de GitHub para commit
  const token = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN;
  if (!token) {
    console.error('[PUBLICAR-API] GITHUB_TOKEN no configurado en el servidor');
    return res.status(500).json({ success: false, error: 'Token de GitHub no configurado en el servidor' });
  }

  const repo = 'renzocolombo/HUERTA-URBANA-2';

  try {
    console.log('[PUBLICAR-API] Obteniendo index.html de GitHub...');
    const htmlRes = await fetch(`https://api.github.com/repos/${repo}/contents/index.html`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    });

    if (!htmlRes.ok) {
      return res.status(500).json({ success: false, error: 'Error obteniendo index.html de GitHub' });
    }

    const htmlJson = await htmlRes.json();
    const htmlContent = Buffer.from(htmlJson.content, 'base64').toString('utf-8');

    // Preparar actualizaciones
    const monto = Math.floor(contenido.monto_minimo).toLocaleString('es-AR');
    let htmlActualizado = htmlContent
      .replace(/(<span id="envio-gratis-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/(<span id="compra-minima-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/(<span id="footer-minima-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/data-monto-minimo="\d+"/, `data-monto-minimo="${Math.floor(contenido.monto_minimo)}"`);

    const VERDURAS = [
      'Papa', 'Cebolla común', 'Cebolla morada', 'Tomate', 'Tomate cherry', 
      'Zanahoria', 'Lechuga', 'Zapallito', 'Zapallo blanco', 'Morrón rojo', 'Rúcula', 
      'Espinaca', 'Remolacha', 'Pepino', 'Brócoli', 'Cabutia', 'Ajo', 'Berenjena'
    ];

    const FRUTAS = [
      'Palta', 'Manzana roja', 'Manzana verde', 'Banana', 'Naranja', 
      'Limón', 'Durazno', 'Pomelo', 'Uva', 'Arándano', 'Choclo'
    ];

    const productosActivos = contenido.productos.filter(p => p.activo);
    const capitalizar = str => str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const clasificar = (lista) => productosActivos
      .filter(p => lista.some(v => v.toLowerCase() === p.nombre.toLowerCase().trim()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(p => ({
        id: p.nombre.toLowerCase().replace(/ /g, '-'),
        name: capitalizar(p.nombre),
        price: Math.floor(p.precio),
        unit: p.unit || p.unidad,
        step: 0.5,
        min: 0.5
      }));

    const extras = productosActivos
      .filter(p => !VERDURAS.some(v => v.toLowerCase() === p.nombre.toLowerCase().trim())
                && !FRUTAS.some(f => f.toLowerCase() === p.nombre.toLowerCase().trim()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const todosProductos = {
      verduras: clasificar(VERDURAS),
      frutas: clasificar(FRUTAS),
      extras
    };

    const regexIndividual = /('verduras'\s*:\s*\[[\s\S]*?'extras'\s*:\s*\[[\s\S]*?\])/;
    if (regexIndividual.test(htmlActualizado)) {
      const nuevoIndividual = `'verduras': ${JSON.stringify(todosProductos.verduras)},\n    'frutas': ${JSON.stringify(todosProductos.frutas)},\n    'extras': ${JSON.stringify(todosProductos.extras)}`;
      htmlActualizado = htmlActualizado.replace(regexIndividual, nuevoIndividual);
      console.log('[PUBLICAR-API] ✅ Productos reemplazados en HTML');
    }

    const versionActual = htmlActualizado.match(/style\.css\?v=([\d.]+)/)?.[1] || '1';
    const versionNueva = (parseFloat(versionActual) + 0.1).toFixed(1);
    htmlActualizado = htmlActualizado.replace(
      /style\.css\?v=[\d.]+/g,
      `style.css?v=${versionNueva}`
    );

    // Commit atómico vía Git Trees
    console.log('[PUBLICAR-API] Iniciando commit atómico vía Git Trees...');
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/main`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    });
    const refJson = await refRes.json();
    const latestCommitSha = refJson.object.sha;

    const commitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits/${latestCommitSha}`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    });
    const commitJson = await commitRes.json();
    const treeSha = commitJson.tree.sha;

    const newTreeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Huerta-Urbana' },
      body: JSON.stringify({
        base_tree: treeSha,
        tree: [
          { path: 'precios.json', mode: '100644', type: 'blob', content: JSON.stringify(contenido, null, 2) },
          { path: 'index.html', mode: '100644', type: 'blob', content: htmlActualizado }
        ]
      })
    });
    const newTree = await newTreeRes.json();

    const newCommitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Huerta-Urbana' },
      body: JSON.stringify({
        message: 'feat: actualizar precios e index en un solo commit',
        tree: newTree.sha,
        parents: [latestCommitSha]
      })
    });
    const newCommit = await newCommitRes.json();

    const updateRefRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/main`, {
      method: 'PATCH',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Huerta-Urbana' },
      body: JSON.stringify({ sha: newCommit.sha })
    });

    if (!updateRefRes.ok) {
      throw new Error('Error al actualizar la referencia main en GitHub');
    }

    console.log('[PUBLICAR-API] Proceso completado exitosamente ✅');
    return res.status(200).json({ success: true, commit: newCommit.sha });
  } catch (error) {
    console.error('[PUBLICAR-API] Error interno:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
