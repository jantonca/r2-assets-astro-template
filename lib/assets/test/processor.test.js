import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

import { AssetProcessor } from '../core/processor.js'

function createProcessor(overrides = {}) {
  return Object.assign(Object.create(AssetProcessor.prototype), {
    bucketName: 'test-bucket',
    manifest: {
      storage: { used: 0, limit: 1000, percentage: 0 },
      processed: {},
    },
    ...overrides,
  })
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
