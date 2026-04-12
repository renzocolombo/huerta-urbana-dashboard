export default async function handler(req, res) {
  console.log('[PUBLICAR-API] Iniciando proceso de publicación única...')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { contenido } = req.body
  const token = process.env.VITE_GITHUB_TOKEN
  const repo = 'renzocolombo/HUERTA-URBANA-2'

  try {
    // 1. Obtener contenido actual de index.html y sw.js para modificarlos
    console.log('[PUBLICAR-API] Obteniendo archivos base de GitHub...')
    
    const [htmlRes, swRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/contents/index.html`, {
        headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
      }),
      fetch(`https://api.github.com/repos/${repo}/contents/sw.js`, {
        headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
      })
    ])

    if (!htmlRes.ok || !swRes.ok) {
      return res.status(500).json({ success: false, error: 'Error obteniendo archivos base de GitHub' })
    }

    const htmlJson = await htmlRes.json()
    const swJson = await swRes.json()

    const htmlContent = Buffer.from(htmlJson.content, 'base64').toString('utf-8')
    const swContent = Buffer.from(swJson.content, 'base64').toString('utf-8')

    // 2. Preparar los contenidos actualizados
    console.log('[PUBLICAR-API] Preparando actualizaciones...')

    // A. index.html
    const monto = Math.floor(contenido.monto_minimo).toLocaleString('es-AR')
    let htmlActualizado = htmlContent
      .replace(/(<span id="envio-gratis-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/(<span id="compra-minima-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/(<span id="footer-minima-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/data-monto-minimo="\d+"/, `data-monto-minimo="${Math.floor(contenido.monto_minimo)}"`)

    const VERDURAS = ['Papa', 'Cebolla común', 'Cebolla morada', 'Tomate', 'Tomate cherry', 
      'Zanahoria', 'Lechuga', 'Zapallito', 'Zapallo blanco', 'Morrón rojo', 'Rúcula', 
      'Espinaca', 'Remolacha', 'Pepino', 'Brócoli', 'Cabutia', 'Ajo', 'Berenjena']

    const FRUTAS = ['Palta', 'Manzana roja', 'Manzana verde', 'Banana', 'Naranja', 
      'Limón', 'Durazno', 'Pomelo', 'Uva', 'Arándano', 'Choclo']

    const productosActivos = contenido.productos.filter(p => p.activo)
    const capitalizar = str => str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

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
      }))

    const extras = productosActivos
      .filter(p => !VERDURAS.some(v => v.toLowerCase() === p.nombre.toLowerCase().trim())
                && !FRUTAS.some(f => f.toLowerCase() === p.nombre.toLowerCase().trim()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(p => ({
        id: p.nombre.toLowerCase().replace(/ /g, '-'),
        name: capitalizar(p.nombre),
        price: Math.floor(p.precio),
        unit: p.unit || p.unidad,
        step: 0.5,
        min: 0.5
      }))

    const todosProductos = {
      verduras: clasificar(VERDURAS),
      frutas: clasificar(FRUTAS),
      extras
    }

    htmlActualizado = htmlActualizado.replace(
      /\/\/ PRODUCTOS_START[\s\S]*?\/\/ PRODUCTOS_END/,
      `// PRODUCTOS_START
const PRODUCTOS_DATA = ${JSON.stringify(todosProductos, null, 2)};
// PRODUCTOS_END`
    )
    
    // Incrementar versión del CSS para forzar recarga
    const versionActual = htmlActualizado.match(/style\.css\?v=([\d.]+)/)?.[1] || '1'
    const versionNueva = (parseFloat(versionActual) + 0.1).toFixed(1)
    htmlActualizado = htmlActualizado.replace(
      /style\.css\?v=[\d.]+/g,
      `style.css?v=${versionNueva}`
    )

    // B. sw.js
    const timestamp = Date.now()
    const swActualizado = swContent.replace(
      /const CACHE_NAME = 'huerta-urbana-[^']*'/,
      `const CACHE_NAME = 'huerta-urbana-${timestamp}'`
    )

    // 3. Flujo API Git Trees (Commit único)
    console.log('[PUBLICAR-API] Iniciando commit atómico via Git Trees...')

    // 3.1 Obtener el último commit
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/main`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    })
    const refJson = await refRes.json()
    const latestCommitSha = refJson.object.sha
    console.log('[PUBLICAR-API] Último commit SHA:', latestCommitSha)

    // 3.2 Obtener el tree del último commit
    const commitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits/${latestCommitSha}`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    })
    const commitJson = await commitRes.json()
    const treeSha = commitJson.tree.sha

    // 3.3 Crear nuevo tree con los 3 archivos actualizados
    const newTreeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Huerta-Urbana' },
      body: JSON.stringify({
        base_tree: treeSha,
        tree: [
          { path: 'precios.json', mode: '100644', type: 'blob', content: JSON.stringify(contenido, null, 2) },
          { path: 'index.html', mode: '100644', type: 'blob', content: htmlActualizado },
          { path: 'sw.js', mode: '100644', type: 'blob', content: swActualizado }
        ]
      })
    })
    const newTree = await newTreeRes.json()
    console.log('[PUBLICAR-API] Nuevo Tree creado:', newTree.sha)

    // 3.4 Crear nuevo commit
    const newCommitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Huerta-Urbana' },
      body: JSON.stringify({
        message: 'feat: actualizar precios, index y sw en un solo commit',
        tree: newTree.sha,
        parents: [latestCommitSha]
      })
    })
    const newCommit = await newCommitRes.json()
    console.log('[PUBLICAR-API] Nuevo Commit creado:', newCommit.sha)

    // 3.5 Actualizar la referencia main
    const updateRefRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/main`, {
      method: 'PATCH',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Huerta-Urbana' },
      body: JSON.stringify({ sha: newCommit.sha })
    })

    if (!updateRefRes.ok) {
        throw new Error('Error al actualizar la referencia main')
    }
    console.log('[PUBLICAR-API] Referencia main actualizada ✅')


    console.log('[PUBLICAR-API] Proceso completado exitosamente.')
    res.status(200).json({ success: true, commit: newCommit.sha })
  } catch (error) {
    console.error('[PUBLICAR-API] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
}
