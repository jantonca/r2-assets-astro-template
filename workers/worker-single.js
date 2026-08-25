/**
 * Cloudflare Worker — Combined Site + Asset Server
 * Serves both your static site and R2 assets from a single worker.
 *
 * Use this pattern when you have a static Astro site (no SSR adapter)
 * and want everything in one worker with one wrangler.toml.
 *
 * Features: Format negotiation, Save-Data support, smart fallbacks.
 */

import {
  buildFallbackKeys,
  buildFormatCandidates,
  createAssetResponse,
  downgradeVariantKey,
  getVariantSizesForPath,
  isSupportedAssetMethod,
  methodNotAllowedResponse,
} from './r2-response.js'

export default {
  async fetch(request, env) {
    if (!isSupportedAssetMethod(request.method)) {
      return methodNotAllowedResponse()
    }

    const url = new URL(request.url)

    // Route asset requests to R2
    if (url.pathname.startsWith('/images/')) {
      return handleImageRequest(request, env)
    }

    if (
      url.pathname.startsWith('/documents/') ||
      url.pathname.startsWith('/fonts/')
    ) {
      return handleStaticAssetRequest(request, env)
    }

    // Serve static site assets (Astro build output)
    return env.ASSETS.fetch(request)
  },
}

async function handleImageRequest(request, env) {
  const url = new URL(request.url)
  const accept = request.headers.get('Accept') || ''
  const saveData = request.headers.get('Save-Data') === 'on'

  let imagePath = url.pathname.substring(1)
  const variantSizes = getVariantSizesForPath(imagePath)

  // Smart format selection based on Accept header
  const supportsAvif = accept.includes('image/avif')
  const supportsWebp = accept.includes('image/webp')

  // Try to upgrade format if requesting original
  if (/\.(jpe?g|png|gif)$/i.test(imagePath)) {
    imagePath = await selectBestFormat(
      imagePath,
      { avif: supportsAvif, webp: supportsWebp },
      variantSizes,
      env
    )
  }

  // Downgrade size if Save-Data is on
  if (saveData) imagePath = downgradeVariantKey(imagePath, variantSizes)

  const object = await env.IMAGES_BUCKET.get(imagePath)

  if (!object) {
    // Try fallback chain
    const fallback = await fetchWithFallback(
      imagePath,
      env,
      { avif: supportsAvif, webp: supportsWebp },
      variantSizes
    )
    if (!fallback) return new Response('Image not found', { status: 404 })

    return createAssetResponse(
      request,
      fallback.object,
      fallback.key,
      'Accept, Save-Data'
    )
  }

  return createAssetResponse(
    request,
    object,
    imagePath,
    'Accept, Save-Data'
  )
}

async function handleStaticAssetRequest(request, env) {
  const url = new URL(request.url)
  const assetPath = url.pathname.substring(1)

  const object = await env.IMAGES_BUCKET.get(assetPath)

  if (!object) {
    return new Response('Asset not found', { status: 404 })
  }

  return createAssetResponse(request, object, assetPath)
}

async function selectBestFormat(imagePath, supportedFormats, variantSizes, env) {
  for (const candidate of buildFormatCandidates(
    imagePath,
    supportedFormats,
    variantSizes
  )) {
    if (await checkIfExists(candidate, env)) return candidate
  }

  return imagePath
}

async function fetchWithFallback(imagePath, env, supportedFormats, variantSizes) {
  for (const fallback of buildFallbackKeys(
    imagePath,
    supportedFormats,
    variantSizes
  )) {
    const object = await env.IMAGES_BUCKET.get(fallback)
    if (object) return { key: fallback, object }
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
