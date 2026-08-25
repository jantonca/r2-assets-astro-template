/**
 * Cloudflare Worker — Separate CDN Asset Server
 * Serves images, fonts, and documents from R2 with caching headers.
 * Deploy on a CDN subdomain (e.g. cdn.yourproject.com) separate from your main site.
 *
 * Use this pattern when your main site uses an Astro adapter (Cloudflare, Node, etc.)
 * that generates its own worker and you can't add R2 bindings to it.
 */

import {
  createAssetResponse,
  isSupportedAssetMethod,
  methodNotAllowedResponse,
} from './r2-response.js'

export default {
  async fetch(request, env) {
    if (!isSupportedAssetMethod(request.method)) {
      return methodNotAllowedResponse()
    }

    const url = new URL(request.url)

    // Only handle asset paths
    if (
      url.pathname.startsWith('/images/') ||
      url.pathname.startsWith('/fonts/') ||
      url.pathname.startsWith('/documents/')
    ) {
      return handleAssetRequest(request, env)
    }

    return new Response('Not found', { status: 404 })
  },
}

async function handleAssetRequest(request, env) {
  const url = new URL(request.url)
  const assetPath = url.pathname.substring(1)

  const object = await env.IMAGES_BUCKET.get(assetPath)

  if (!object) {
    return new Response('Asset not found', { status: 404 })
  }

  return createAssetResponse(request, object, assetPath)
}
