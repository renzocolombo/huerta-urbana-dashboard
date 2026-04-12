export default async function handler(req, res) {
  console.log('[PUBLICAR-API] Iniciando...')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { contenido } = req.body
  const token = process.env.VITE_GITHUB_TOKEN
  const repo = 'renzocolombo/HUERTA-URBANA-2'
  const path = 'precios.json'

  try {
    // 1. Obtener el SHA actual de precios.json
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    })
    
    if (!getRes.ok && getRes.status !== 404) {
      const err = await getRes.json()
      return res.status(500).json({ success: false, error: `Error obteniendo SHA: ${err.message}` })
    }

    const getJson = await getRes.json()
    const sha = getJson.sha

    // 2. Actualizar precios.json
    console.log('[PUBLICAR-API] Actualizando precios.json...')
    const updateRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Huerta-Urbana'
      },
      body: JSON.stringify({
        message: 'feat: actualizar precios y productos desde dashboard',
        content: Buffer.from(JSON.stringify(contenido, null, 2), 'utf-8').toString('base64'),
        sha: sha
      })
    })

    if (!updateRes.ok) {
      const err = await updateRes.json()
      return res.status(500).json({ success: false, error: `Error actualizando precios: ${err.message}` })
    }

    console.log('[PUBLICAR-API] precios.json actualizado ✅')

    // 3. Actualizar index.html directamente (Sincronización Web)
    // Leer index.html actual
    console.log('[PUBLICAR-API] Leyendo index.html...')
    const htmlRes = await fetch(`https://api.github.com/repos/${repo}/contents/index.html`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    })
    const htmlJson = await htmlRes.json()
    const htmlContent = Buffer.from(htmlJson.content, 'base64').toString('utf-8')
    const htmlSha = htmlJson.sha
    console.log('[PUBLICAR-API] index.html leído, SHA:', htmlSha)

    // Actualizar monto mínimo en los spans del HTML
    const monto = Math.floor(contenido.monto_minimo).toLocaleString('es-AR')
    let htmlActualizado = htmlContent
      .replace(/(<span id="envio-gratis-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/(<span id="compra-minima-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/(<span id="footer-minima-monto">)[^<]*/g, `$1$${monto}`)
      .replace(/data-monto-minimo="\d+"/, `data-monto-minimo="${Math.floor(contenido.monto_minimo)}"`)

    // Clasificar productos para el catálogo web
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
        unit: p.unit || p.unidad, // Soportar ambos nombres de propiedad
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

    // Reemplazar el bloque de productos en el HTML
    htmlActualizado = htmlActualizado.replace(
      /\/\/ PRODUCTOS_START[\s\S]*?\/\/ PRODUCTOS_END/,
      `// PRODUCTOS_START
const PRODUCTOS_DATA = ${JSON.stringify(todosProductos, null, 2)};
// PRODUCTOS_END`
    )

    // Escribir index.html actualizado
    console.log('[PUBLICAR-API] Actualizando index.html...')
    await fetch(`https://api.github.com/repos/${repo}/contents/index.html`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Huerta-Urbana'
      },
      body: JSON.stringify({
        message: 'feat: actualizar precios en web',
        content: Buffer.from(htmlActualizado, 'utf-8').toString('base64'),
        sha: htmlSha
      })
    })

    console.log('[PUBLICAR-API] index.html actualizado ✅')

    // 4. Disparar el workflow de GitHub Actions
    await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Huerta-Urbana'
      },
      body: JSON.stringify({ event_type: 'actualizar-precios' })
    })

    res.status(200).json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
