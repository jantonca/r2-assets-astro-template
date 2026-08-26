import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { DevImagesManager, resolveLocalImagePath } from '../cli/dev-images.js'

const readlineInterface = {
  close() {},
  async question() {
    return '3'
  },
}

test('resolveLocalImagePath keeps nested images inside the image directory', () => {
  const root = path.resolve('/tmp/r2-images')
  assert.equal(
    resolveLocalImagePath(root, 'portfolio/example.jpg'),
    path.join(root, 'portfolio', 'example.jpg')
  )
})

test('resolveLocalImagePath rejects traversal and platform-specific separators', () => {
  assert.throws(
    () => resolveLocalImagePath('/tmp/r2-images', '../secret.txt'),
    /Unsafe image path/
  )
  assert.throws(
    () => resolveLocalImagePath('/tmp/r2-images', '..\\secret.txt'),
    /Unsafe image path/
  )
})

test('listR2Images propagates listing failures', async () => {
  const manager = new DevImagesManager({
    bucketName: 'test-bucket',
    localImagesPath: '/tmp/r2-images',
    readlineInterface,
    s3Client: {
      async send() {
        throw new Error('R2 unavailable')
      },
    },
  })

  await assert.rejects(manager.listR2Images(), /R2 unavailable/)
})

test('pullAll reports partial download failures', async () => {
  const manager = new DevImagesManager({
    bucketName: 'test-bucket',
    localImagesPath: '/tmp/r2-images',
    readlineInterface,
    s3Client: { async send() {} },
  })
  manager.checkStatus = async () => ({ missing: ['one.jpg', 'two.jpg'] })
  manager.downloadImage = async (filename) => filename === 'one.jpg'

  await assert.rejects(manager.pullAll(), /1 image download\(s\) failed/)
})

test('init derives the local image directory from sourcePath', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'r2-dev-images-test-')
  )
  const manager = new DevImagesManager({
    bucketName: 'test-bucket',
    projectRoot,
    readlineInterface,
    s3Client: { async send() {} },
    configLoader: async () => ({ sourcePath: 'assets' }),
  })

  try {
    await manager.init()
    assert.equal(
      manager.localImagesPath,
      path.join(projectRoot, 'assets', 'images')
    )
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true })
  }
})

test('listR2Images skips R2 directory markers', async () => {
  // R2 stores directories as zero-byte keys ending in `/`. path.resolve strips
  // the trailing slash, so treating one as an image writes a *file* where the
  // directory belongs and every later download fails against it.
  const pages = [
    {
      Contents: [
        { Key: 'images/', Size: 0 },
        { Key: 'images/portfolio/', Size: 0 },
        { Key: 'images/portfolio/example.jpg', Size: 2048 },
        { Key: 'images/portfolio/example-400.webp', Size: 512 },
      ],
    },
  ]
  const manager = new DevImagesManager({
    bucketName: 'test-bucket',
    localImagesPath: '/tmp/r2-images',
    readlineInterface,
    s3Client: {
      async send() {
        return pages.shift()
      },
    },
  })

  assert.deepEqual(await manager.listR2Images(), ['portfolio/example.jpg'])
  assert.throws(
    () => resolveLocalImagePath('/tmp/r2-images', 'portfolio/'),
    /Unsafe image path/
  )
})
