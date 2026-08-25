import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

import { AssetProcessor } from '../core/processor.js'

function createProcessor(overrides = {}) {
  return Object.assign(Object.create(AssetProcessor.prototype), {
    bucketName: 'test-bucket',
    config: {
      enablePlaceholders: false,
      quality: {
        webp: { 400: 90, 800: 85, 1200: 80, original: 80 },
        avif: { 400: 75, 800: 65, 1200: 55, original: 55 },
      },
      rules: {},
      skipUnchanged: true,
    },
    RULES: {},
    manifest: {
      storage: { used: 0, limit: 1000, percentage: 0 },
      processed: {},
    },
    ...overrides,
  })
}

async function withTempSource(extension, callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-processor-test-'))
  const sourcePath = path.join(tempDir, `example${extension}`)
  await fs.writeFile(sourcePath, 'source')

  try {
    return await callback(sourcePath)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

test('uploadToR2 overwrites existing keys when requested', async () => {
  const sent = []
  const processor = createProcessor({
    checkObjectExists: async () => {
      throw new Error('checkObjectExists should not run for overwrite uploads')
    },
    s3Client: {
      send: async (command) => {
        sent.push(command)
        return {}
      },
    },
  })

  const uploaded = await processor.uploadToR2(
    Buffer.from('image'),
    'images/example.webp',
    { overwrite: true }
  )

  assert.equal(uploaded, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0] instanceof PutObjectCommand, true)
  assert.equal(sent[0].input.Key, 'images/example.webp')
  assert.equal(sent[0].input.ContentType, 'image/webp')
})

test('uploadToR2 can keep an existing key when overwrite is false', async () => {
  const sent = []
  const processor = createProcessor({
    checkObjectExists: async () => true,
    s3Client: {
      send: async (command) => {
        sent.push(command)
        return {}
      },
    },
  })

  const uploaded = await processor.uploadToR2(
    Buffer.from('image'),
    'images/example.webp'
  )

  assert.equal(uploaded, true)
  assert.deepEqual(sent, [])
})

test('getStorageStatus sums every ListObjectsV2 page', async () => {
  const pages = [
    {
      Contents: [{ Size: 100 }, { Size: 50 }],
      NextContinuationToken: 'next-page',
    },
    {
      Contents: [{ Size: 25 }],
    },
  ]
  const tokens = []
  const processor = createProcessor({
    s3Client: {
      send: async (command) => {
        assert.equal(command instanceof ListObjectsV2Command, true)
        tokens.push(command.input.ContinuationToken)
        return pages.shift()
      },
    },
  })

  const status = await processor.getStorageStatus()

  assert.deepEqual(tokens, [undefined, 'next-page'])
  assert.equal(status.used, 175)
  assert.equal(status.limit, 1000)
  assert.equal(status.percentage, 18)
})

test('getStorageStatus propagates R2 listing failures', async () => {
  const processor = createProcessor({
    s3Client: {
      send: async () => {
        throw new Error('R2 unavailable')
      },
    },
  })

  await assert.rejects(
    processor.getStorageStatus(),
    /Failed to get R2 storage status: R2 unavailable/
  )
})

test('processFile does not update the manifest after a failed upload', async () => {
  const processor = createProcessor({
    config: {
      enablePlaceholders: false,
      quality: { 400: 90 },
      rules: {
        '.svg': { outputs: ['svg'], sizes: ['original'] },
      },
      skipUnchanged: true,
    },
    getFileHash: async () => 'new-hash',
    optimizeSVG: async () => Buffer.from('optimized'),
    uploadToR2: async () => false,
  })

  await assert.rejects(
    processor.processFile('/tmp/example.svg', 'images/example.svg'),
    /manifest was not updated/
  )
  assert.equal(processor.manifest.processed['images/example.svg'], undefined)
})

test('processFile records the manifest only after every output succeeds', async () => {
  const processor = createProcessor({
    config: {
      enablePlaceholders: false,
      quality: { 400: 90 },
      rules: {
        '.jpg': { outputs: ['webp'], sizes: [400] },
      },
      skipUnchanged: true,
    },
    getFileHash: async () => 'new-hash',
    optimizeImage: async () => Buffer.from('optimized'),
    uploadToR2: async () => true,
    manifest: {
      storage: { used: 0, limit: 1000, percentage: 0 },
      processed: {
        'images/example.jpg': { hash: 'new-hash', version: 1 },
      },
    },
  })

  await withTempSource('.jpg', async (sourcePath) => {
    await processor.processFile(sourcePath, 'images/example.jpg')
  })

  assert.deepEqual(processor.manifest.processed['images/example.jpg'].outputs, [
    'images/example.jpg',
    'images/example-400.webp',
  ])
  assert.equal(processor.manifest.processed['images/example.jpg'].version, 2)
})

test('processFile keeps the previous manifest entry after a partial upload failure', async () => {
  let uploadCount = 0
  const previousEntry = { hash: 'previous-hash', version: 1, outputs: [] }
  const processor = createProcessor({
    config: {
      enablePlaceholders: false,
      quality: { 400: 90 },
      rules: {
        '.jpg': { outputs: ['webp'], sizes: [400] },
      },
      skipUnchanged: true,
    },
    getFileHash: async () => 'new-hash',
    optimizeImage: async () => Buffer.from('optimized'),
    uploadToR2: async () => {
      uploadCount += 1
      return uploadCount === 1
    },
    manifest: {
      storage: { used: 0, limit: 1000, percentage: 0 },
      processed: { 'images/example.jpg': previousEntry },
    },
  })

  await withTempSource('.jpg', async (sourcePath) => {
    await assert.rejects(
      processor.processFile(sourcePath, 'images/example.jpg'),
      /manifest was not updated/
    )
  })

  assert.equal(processor.manifest.processed['images/example.jpg'], previousEntry)
})

test('processFile skips an unchanged current-version manifest entry', async () => {
  const currentEntry = { hash: 'same-hash', version: 2, outputs: [] }
  const processor = createProcessor({
    config: {
      enablePlaceholders: false,
      quality: { 400: 90 },
      rules: {
        '.jpg': { outputs: ['webp'], sizes: [400] },
      },
      skipUnchanged: true,
    },
    getFileHash: async () => 'same-hash',
    optimizeImage: async () => {
      throw new Error('unchanged file should not be optimized')
    },
    manifest: {
      storage: { used: 0, limit: 1000, percentage: 0 },
      processed: { 'images/example.jpg': currentEntry },
    },
  })

  await processor.processFile('/tmp/example.jpg', 'images/example.jpg')
  assert.equal(processor.manifest.processed['images/example.jpg'], currentEntry)
})

test('image quality supports per-format and legacy flat configuration', () => {
  const processor = createProcessor()
  assert.equal(processor.getImageQuality(800, 'avif'), 65)

  processor.config.quality = { 400: 88, original: 70 }
  assert.equal(processor.getImageQuality(400, 'webp'), 88)
  assert.equal(processor.getImageQuality('original', 'avif'), 70)
})

test('init honors custom source and manifest paths', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'r2-processor-init-test-')
  )
  await fs.writeFile(
    path.join(projectRoot, 'assets.config.js'),
    "export default { sourcePath: 'assets', manifestPath: 'state/manifest.json' }\n"
  )
  await fs.mkdir(path.join(projectRoot, 'state'), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, 'state', 'manifest.json'),
    JSON.stringify({
      processed: {},
      storage: { used: 0, limit: 1000, percentage: 0 },
    })
  )
  const processor = createProcessor({
    config: {
      sourcePath: 'public',
      manifestPath: 'public/assets-manifest.json',
    },
  })

  try {
    await processor.init(projectRoot)
    assert.equal(processor.sourcePath, path.join(projectRoot, 'assets'))
    assert.equal(
      processor.manifestPath,
      path.join(projectRoot, 'state', 'manifest.json')
    )
    assert.equal(processor.manifestLoaded, true)
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true })
  }
})

test('init rejects a corrupt manifest', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'r2-processor-manifest-test-')
  )
  await fs.mkdir(path.join(projectRoot, 'public'), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, 'public', 'assets-manifest.json'),
    '{invalid json'
  )
  const processor = createProcessor({
    config: {
      sourcePath: 'public',
      manifestPath: 'public/assets-manifest.json',
    },
  })

  try {
    await assert.rejects(
      processor.init(projectRoot),
      /Failed to load asset manifest/
    )
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true })
  }
})

test('webp and avif sources upload originals and generated variants', async () => {
  const uploaded = []
  const processor = createProcessor({
    config: {
      enablePlaceholders: false,
      quality: { 400: 90 },
      rules: {
        '.webp': { outputs: ['webp'], sizes: [400] },
        '.avif': { outputs: ['avif'], sizes: [400] },
      },
      skipUnchanged: false,
    },
    getFileHash: async () => 'hash',
    optimizeImage: async () => Buffer.from('optimized'),
    uploadToR2: async (_content, key) => {
      uploaded.push(key)
      return true
    },
  })

  await withTempSource('.webp', async (sourcePath) => {
    await processor.processFile(sourcePath, 'images/webp-source.webp')
  })
  await withTempSource('.avif', async (sourcePath) => {
    await processor.processFile(sourcePath, 'images/avif-source.avif')
  })

  assert.deepEqual(uploaded, [
    'images/webp-source.webp',
    'images/webp-source-400.webp',
    'images/avif-source.avif',
    'images/avif-source-400.avif',
  ])
})

test('processFile rejects colliding output keys before uploading', async () => {
  let uploads = 0
  const processor = createProcessor({
    config: {
      enablePlaceholders: false,
      quality: { 400: 90 },
      rules: {
        '.jpg': { outputs: ['webp'], sizes: [400] },
        '.png': { outputs: ['webp'], sizes: [400] },
      },
      skipUnchanged: false,
    },
    getFileHash: async () => 'hash',
    optimizeImage: async () => Buffer.from('optimized'),
    uploadToR2: async () => {
      uploads += 1
      return true
    },
  })

  await withTempSource('.jpg', async (sourcePath) => {
    await processor.processFile(sourcePath, 'images/hero.jpg')
  })
  const uploadsAfterFirstSource = uploads

  await withTempSource('.png', async (sourcePath) => {
    await assert.rejects(
      processor.processFile(sourcePath, 'images/hero.png'),
      /R2 output collision/
    )
  })
  assert.equal(uploads, uploadsAfterFirstSource)
})
