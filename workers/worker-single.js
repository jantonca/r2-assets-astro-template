/**
 * Cloudflare Worker — Combined Site + Asset Server
 * Serves both your static site and R2 assets from a single worker.
 *
 * Use this pattern when you have a static Astro site (no SSR adapter)
 * and want everything in one worker with one wrangler.toml.
 *
 * Features: Format negotiation, Save-Data support, smart fallbacks.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Route asset requests to R2
    if (url.pathname.startsWith('/images/')) {
      return handleImageRequest(request, env, ctx)
    }

    if (url.pathname.startsWith('/documents/') || url.pathname.startsWith('/fonts/')) {
      return handleStaticAssetRequest(request, env, ctx)
    }

    // Serve static site assets (Astro build output)
    return env.ASSETS.fetch(request)
  },
}

async function handleImageRequest(request, env, ctx) {
  const url = new URL(request.url)
  const accept = request.headers.get('Accept') || ''
  const saveData = request.headers.get('Save-Data') === 'on'

  let imagePath = url.pathname.substring(1)

  // Smart format selection based on Accept header
  const supportsAvif = accept.includes('image/avif')
  const supportsWebp = accept.includes('image/webp')

  // Try to upgrade format if requesting original
  if (!imagePath.endsWith('.avif') && !imagePath.endsWith('.webp')) {
    imagePath = await selectBestFormat(imagePath, { avif: supportsAvif, webp: supportsWebp }, env)
  }

  // Downgrade size if Save-Data is on
  if (saveData && imagePath.match(/-(\d+)\.(webp|avif)$/)) {
    imagePath = imagePath.replace(/-1200\./, '-800.').replace(/-800\./, '-400.')
  }

  const object = await env.IMAGES_BUCKET.get(imagePath)

  if (!object) {
    // Try fallback chain
    const fallback = await fetchWithFallback(imagePath, env, { avif: supportsAvif, webp: supportsWebp })
    if (!fallback) return new Response('Image not found', { status: 404 })

    const headers = buildCacheHeaders(fallback)
    if (saveData) headers.set('Vary', 'Accept, Save-Data')
    return new Response(fallback.body, { headers })
  }

  const headers = buildCacheHeaders(object)
  if (saveData) headers.set('Vary', 'Accept, Save-Data')
  return new Response(object.body, { headers })
}

async function handleStaticAssetRequest(request, env, ctx) {
  const url = new URL(request.url)
  const assetPath = url.pathname.substring(1)

  const object = await env.IMAGES_BUCKET.get(assetPath)

  if (!object) {
    return new Response('Asset not found', { status: 404 })
  }

  const headers = buildCacheHeaders(object)
  return new Response(object.body, { headers })
}

function buildCacheHeaders(object) {
  const contentType = object.httpMetadata?.contentType || getContentType(object.key || '')
  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('CDN-Cache-Control', 'max-age=31536000')
  headers.set('Vary', 'Accept')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Access-Control-Allow-Origin', '*')
  if (object.httpEtag) headers.set('ETag', object.httpEtag)
  return headers
}

async function selectBestFormat(imagePath, supportedFormats, env) {
  const basePath = imagePath.replace(/\.(jpg|jpeg|png|gif|webp|avif)$/i, '')

  if (supportedFormats.avif) {
    const avifPath = `${basePath}.avif`
    if (await checkIfExists(avifPath, env)) return avifPath
  }

  if (supportedFormats.webp) {
    const webpPath = `${basePath}.webp`
    if (await checkIfExists(webpPath, env)) return webpPath
  }

  return imagePath
}

async function fetchWithFallback(imagePath, env, supportedFormats) {
  const match = imagePath.match(/^(.+?)(?:-(\d+))?\.(webp|avif|jpe?g|png|gif|svg)$/i)
  if (!match) return null

  const [, baseName, size, format] = match
  const fallbacks = []

  // If AVIF failed, try WebP
  if (format === 'avif' && supportedFormats.webp) {
    fallbacks.push(`${baseName}${size ? `-${size}` : ''}.webp`)
  }

  // Try different sizes
  if (size) {
    const sizes = [400, 800, 1200]
    for (const s of sizes) {
      if (s < parseInt(size)) {
        fallbacks.push(`${baseName}-${s}.${format}`)
      }
    }
  }

  // Try original formats
  fallbacks.push(`${baseName}.jpg`, `${baseName}.jpeg`, `${baseName}.png`)

  for (const fallback of fallbacks) {
    const object = await env.IMAGES_BUCKET.get(fallback)
    if (object) return object
  }

  return null
}

async function checkIfExists(path, env) {
  try {
    const object = await env.IMAGES_BUCKET.head(path)
    return object !== null
  } catch {
    return false
  }
}

function getContentType(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  const types = {
    'webp': 'image/webp',
    'avif': 'image/avif',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'woff2': 'font/woff2',
    'woff': 'font/woff',
    'ttf': 'font/ttf',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
  }
  return types[ext] || 'application/octet-stream'
}
