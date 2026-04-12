export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { contenido } = req.body
  const token = process.env.VITE_GITHUB_TOKEN
  const repo = 'renzocolombo/HUERTA-URBANA-2'
  const path = 'precios.json'

  try {
    // Obtener el SHA actual del archivo
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'Huerta-Urbana' }
    })
    
    if (!getRes.ok && getRes.status !== 404) {
      const err = await getRes.json()
      return res.status(500).json({ success: false, error: `Error obteniendo SHA: ${err.message}` })
    }

    const getJson = await getRes.json()
    const sha = getJson.sha

    // Actualizar el archivo
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

    if (updateRes.ok) {
      res.status(200).json({ success: true })
    } else {
      const err = await updateRes.json()
      res.status(500).json({ success: false, error: err.message })
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
