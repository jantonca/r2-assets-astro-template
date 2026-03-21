#!/usr/bin/env node

/**
 * Development Images Helper
 * Downloads images from R2 for local development
 *
 * Usage:
 *   npm run dev:images        # Interactive mode
 *   npm run dev:images:pull   # Download all images
 *   npm run dev:images:check  # Check what's missing
 */

import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs/promises'
import path from 'path'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import readline from 'readline/promises'

import dotenv from 'dotenv'
dotenv.config()

import { createR2Client } from '../core/utils.js'

class DevImagesManager {
  constructor() {
    // Initialize S3 client for R2 using shared utility
    this.s3Client = createR2Client()
    this.bucketName = process.env.R2_BUCKET_NAME

    this.localImagesPath = path.join(process.cwd(), 'public', 'images')
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  }

  /**
   * List all original images in R2 (not processed versions)
   */
  async listR2Images() {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'images/',
      })

      const response = await this.s3Client.send(command)
      const files = response.Contents || []

      // Filter to only original images (not -400, -800, -1200 versions)
      const originals = files
        .map((file) => file.Key)
        .filter((key) => {
          // Skip processed versions (e.g. cover-400.webp, cover-800.webp)
          if (/-\d+\.(webp|avif)$/.test(key)) return false
          // Include all image formats
          return /\.(jpg|jpeg|png|gif|svg|webp|avif)$/i.test(key)
        })
        .map((key) => key.replace('images/', ''))

      return [...new Set(originals)] // Remove duplicates
    } catch (error) {
      console.error('❌ Failed to list R2 images:', error.message)
      return []
    }
  }

  /**
   * List local images
   */
  async listLocalImages() {
    try {
      await fs.mkdir(this.localImagesPath, { recursive: true })
      const results = []
      const scan = async (dir, prefix = '') => {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name
          if (entry.isDirectory()) {
            await scan(path.join(dir, entry.name), rel)
          } else if (/\.(jpg|jpeg|png|gif|svg|webp|avif)$/i.test(entry.name)) {
            results.push(rel)
          }
        }
      }
      await scan(this.localImagesPath)
      return results
    } catch {
      return []
    }
  }

  /**
   * Download a single image from R2
   */
  async downloadImage(filename) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: `images/${filename}`,
      })

      const response = await this.s3Client.send(command)
      const localPath = path.join(this.localImagesPath, filename)

      // Ensure directory exists
      await fs.mkdir(path.dirname(localPath), { recursive: true })

      // Stream to file
      const writeStream = createWriteStream(localPath)
      await pipeline(response.Body, writeStream)

      return true
    } catch (error) {
      console.error(`❌ Failed to download ${filename}:`, error.message)
      return false
    }
  }

  /**
   * Check status of local vs R2 images
   */
  async checkStatus() {
    console.log('🔍 Checking image status...\n')

    const r2Images = await this.listR2Images()
    const localImages = await this.listLocalImages()

    const r2Set = new Set(r2Images)
    const localSet = new Set(localImages)

    const missing = r2Images.filter((img) => !localSet.has(img))
    const extra = localImages.filter((img) => !r2Set.has(img))

    console.log(`📊 Status Report:`)
    console.log(`   R2 Images: ${r2Images.length}`)
    console.log(`   Local Images: ${localImages.length}`)
    console.log(`   Missing Locally: ${missing.length}`)
    console.log(`   Extra Locally: ${extra.length}`)

    if (missing.length > 0) {
      console.log('\n📥 Missing images (available in R2):')
      missing.forEach((img) => console.log(`   - ${img}`))
    }

    if (extra.length > 0) {
      console.log('\n📤 Extra local images (not in R2):')
      extra.forEach((img) => console.log(`   - ${img}`))
    }

    return { r2Images, localImages, missing, extra }
  }

  /**
   * Pull all missing images from R2
   */
  async pullAll() {
    const { missing } = await this.checkStatus()

    if (missing.length === 0) {
      console.log('\n✅ All images are already synchronized!')
      return
    }

    console.log(`\n📥 Downloading ${missing.length} images from R2...`)

    let downloaded = 0
    let failed = 0

    for (const filename of missing) {
      process.stdout.write(`   Downloading ${filename}...`)
      const success = await this.downloadImage(filename)
      if (success) {
        downloaded++
        console.log(' ✅')
      } else {
        failed++
        console.log(' ❌')
      }
    }

    console.log(`\n✨ Download complete!`)
    console.log(`   Success: ${downloaded}`)
    console.log(`   Failed: ${failed}`)
  }

  /**
   * Interactive mode
   */
  async interactive() {
    console.log('🖼️  Development Images Manager\n')

    const { missing } = await this.checkStatus()

    if (missing.length === 0) {
      console.log('\n✅ All images are synchronized!')
      this.rl.close()
      return
    }

    console.log('\nOptions:')
    console.log('1. Download all missing images')
    console.log('2. Select specific images to download')
    console.log('3. Exit')

    const choice = await this.rl.question('\nYour choice (1-3): ')

    switch (choice) {
      case '1':
        await this.pullAll()
        break

      case '2':
        await this.selectiveDownload(missing)
        break

      default:
        console.log('Goodbye!')
    }

    this.rl.close()
  }

  /**
   * Selective download
   */
  async selectiveDownload(missing) {
    console.log('\n📋 Select images to download (comma-separated numbers):\n')

    missing.forEach((img, i) => {
      console.log(`${i + 1}. ${img}`)
    })

    const input = await this.rl.question('\nEnter numbers (e.g., 1,3,5): ')
    const indices = input.split(',').map((n) => parseInt(n.trim()) - 1)

    const toDownload = indices
      .filter((i) => i >= 0 && i < missing.length)
      .map((i) => missing[i])

    if (toDownload.length === 0) {
      console.log('No valid selections')
      return
    }

    console.log(`\n📥 Downloading ${toDownload.length} images...`)

    for (const filename of toDownload) {
      process.stdout.write(`   Downloading ${filename}...`)
      const success = await this.downloadImage(filename)
      console.log(success ? ' ✅' : ' ❌')
    }

    console.log('\n✨ Download complete!')
  }

  async cleanup() {
    this.rl.close()
  }
}

// Main execution
async function main() {
  const manager = new DevImagesManager()

  const command = process.argv[2]

  try {
    switch (command) {
      case 'check':
        await manager.checkStatus()
        break

      case 'pull':
        await manager.pullAll()
        break

      default:
        await manager.interactive()
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await manager.cleanup()
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { DevImagesManager }
