import assert from 'node:assert/strict'
import { test } from 'node:test'

import singleWorker from '../../../workers/worker-single.js'
import assetWorker from '../../../workers/worker-assets.js'
import {
  BROWSER_CACHE_CONTROL,
  buildFallbackKeys,
  buildFormatCandidates,
  createAssetResponse,
  downgradeVariantKey,
  getVariantSizesForPath,
} from '../../../workers/r2-response.js'

function createObject(body = 'asset', contentType = 'image/webp') {
  return {
    body,
    httpEtag: 'etag-value',
    httpMetadata: { contentType },
    size: body.length,
  }
}

test('format negotiation targets the generated 800px variant by default', () => {
  assert.deepEqual(
    buildFormatCandidates('images/photo.jpg', { avif: true, webp: true }),
    [
      'images/photo-800.avif',
      'images/photo-800.webp',
      'images/photo.avif',
      'images/photo.webp',
    ]
  )
})

test('format negotiation honors custom sizes and tries unsized variants', () => {
  const customSizes = getVariantSizesForPath('images/photo.jpg', {
    rules: { '.jpg': { sizes: [600, 1600] } },
  })
  assert.deepEqual(
    buildFormatCandidates(
      'images/photo.gif',
      { avif: false, webp: true },
      customSizes
    ),
    ['images/photo-600.webp', 'images/photo.webp']
  )
})

test('Save-Data downgrades to the nearest configured smaller variant', () => {
  assert.equal(
    downgradeVariantKey('images/photo-1600.webp', [600, 1600]),
    'images/photo-600.webp'
  )
})

test('fallbacks prefer the nearest smaller size', () => {
  const fallbacks = buildFallbackKeys('images/photo-1200.avif', {
    avif: true,
    webp: true,
  })

  assert.deepEqual(fallbacks.slice(0, 5), [
    'images/photo-1200.webp',
    'images/photo-800.avif',
    'images/photo-800.webp',
    'images/photo-400.avif',
    'images/photo-400.webp',
  ])
})

test('asset responses use bounded caching and preserve HEAD semantics', async () => {
  const response = createAssetResponse(
    new Request('https://example.com/images/photo.webp', { method: 'HEAD' }),
    createObject(),
    'images/photo.webp'
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), BROWSER_CACHE_CONTROL)
  assert.equal(response.headers.get('Cache-Control').includes('immutable'), false)
  assert.equal(response.headers.get('Content-Type'), 'image/webp')
  assert.equal(response.headers.get('Vary'), 'Accept')
  assert.equal(await response.text(), '')
})

test('separate asset worker handles R2 routes, HEAD, and non-asset paths', async () => {
  const env = {
    IMAGES_BUCKET: {
      get: async (key) =>
        key === 'images/photo.webp' ? createObject() : null,
    },
  }

  const headResponse = await assetWorker.fetch(
    new Request('https://cdn.example.com/images/photo.webp', {
      method: 'HEAD',
    }),
    env
  )
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), '')

  const missingRoute = await assetWorker.fetch(
    new Request('https://cdn.example.com/not-an-asset'),
    env
  )
  assert.equal(missingRoute.status, 404)

  const mutationResponse = await assetWorker.fetch(
    new Request('https://cdn.example.com/images/photo.webp', {
      method: 'DELETE',
    }),
    env
  )
  assert.equal(mutationResponse.status, 405)
})

test('single worker routes site requests to the static asset binding', async () => {
  const response = await singleWorker.fetch(new Request('https://example.com/'), {
    ASSETS: {
      fetch: async () => new Response('site'),
    },
    IMAGES_BUCKET: {},
  })

  assert.equal(await response.text(), 'site')
})

test('single worker negotiates an unsized WebP variant', async () => {
  const requestedKeys = []
  const response = await singleWorker.fetch(
    new Request('https://example.com/images/animation.gif', {
      headers: { Accept: 'image/webp' },
    }),
    {
      ASSETS: { fetch: async () => new Response('site') },
      IMAGES_BUCKET: {
        head: async (key) => (key === 'images/animation.webp' ? {} : null),
        get: async (key) => {
          requestedKeys.push(key)
          return key === 'images/animation.webp' ? createObject() : null
        },
      },
    }
  )

  assert.equal(response.status, 200)
  assert.deepEqual(requestedKeys, ['images/animation.webp'])
  assert.equal(response.headers.get('Vary'), 'Accept, Save-Data')
})

test('GIF negotiation cannot select a same-basename raster variant', async () => {
  const headKeys = []
  const getKeys = []
  const response = await singleWorker.fetch(
    new Request('https://example.com/images/hero.gif', {
      headers: { Accept: 'image/webp' },
    }),
    {
      ASSETS: { fetch: async () => new Response('site') },
      IMAGES_BUCKET: {
        head: async (key) => {
          headKeys.push(key)
          return ['images/hero.webp', 'images/hero-800.webp'].includes(key)
            ? {}
            : null
        },
        get: async (key) => {
          getKeys.push(key)
          if (key === 'images/hero.webp') return createObject('animated-webp')
          if (key === 'images/hero-800.webp') return createObject('jpeg-webp')
          return null
        },
      },
    }
  )

  assert.equal(await response.text(), 'animated-webp')
  assert.deepEqual(headKeys, ['images/hero.webp'])
  assert.deepEqual(getKeys, ['images/hero.webp'])
})

test('SVG requests bypass raster format negotiation', async () => {
  const headKeys = []
  const getKeys = []
  const response = await singleWorker.fetch(
    new Request('https://example.com/images/logo.svg', {
      headers: { Accept: 'image/avif,image/webp' },
    }),
    {
      ASSETS: { fetch: async () => new Response('site') },
      IMAGES_BUCKET: {
        head: async (key) => {
          headKeys.push(key)
          return null
        },
        get: async (key) => {
          getKeys.push(key)
          return createObject('<svg></svg>', 'image/svg+xml')
        },
      },
    }
  )

  assert.equal(response.status, 200)
  assert.deepEqual(headKeys, [])
  assert.deepEqual(getKeys, ['images/logo.svg'])
})

test('single worker serves documents from R2 and rejects mutations', async () => {
  const env = {
    ASSETS: { fetch: async () => new Response('site') },
    IMAGES_BUCKET: {
      get: async () => createObject('pdf', 'application/pdf'),
    },
  }

  const documentResponse = await singleWorker.fetch(
    new Request('https://example.com/documents/resume.pdf'),
    env
  )
  assert.equal(documentResponse.status, 200)
  assert.equal(documentResponse.headers.get('Content-Type'), 'application/pdf')
  assert.equal(documentResponse.headers.get('Vary'), 'Accept')

  const mutationResponse = await singleWorker.fetch(
    new Request('https://example.com/documents/resume.pdf', { method: 'POST' }),
    env
  )
  assert.equal(mutationResponse.status, 405)
  assert.equal(mutationResponse.headers.get('Allow'), 'GET, HEAD')
})
