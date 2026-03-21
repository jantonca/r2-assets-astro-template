/**
 * Cloudflare Worker — Separate CDN Asset Server
 * Serves images, fonts, and documents from R2 with caching headers.
 * Deploy on a CDN subdomain (e.g. cdn.yourproject.com) separate from your main site.
 *
 * Use this pattern when your main site uses an Astro adapter (Cloudflare, Node, etc.)
 * that generates its own worker and you can't add R2 bindings to it.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Only handle asset paths
    if (
      url.pathname.startsWith('/images/') ||
      url.pathname.startsWith('/fonts/') ||
      url.pathname.startsWith('/documents/')
    ) {
      return handleAssetRequest(request, env, ctx)
    }

    return new Response('Not found', { status: 404 })
  },
}

async function handleAssetRequest(request, env, ctx) {
  const url = new URL(request.url)
  const assetPath = url.pathname.substring(1)

  const object = await env.IMAGES_BUCKET.get(assetPath)

  if (!object) {
    return new Response('Asset not found', { status: 404 })
  }

  const contentType = object.httpMetadata?.contentType || getContentType(assetPath)

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('CDN-Cache-Control', 'max-age=31536000')
  headers.set('Vary', 'Accept')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('ETag', object.httpEtag)

  return new Response(object.body, { headers })
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
  }
  return types[ext] || 'application/octet-stream'
}
