/**
 * Enhanced Asset Processor with LQIP Placeholder Generation
 * Adds blur placeholder support for improved loading experience
 *
 * @module AssetProcessor
 * @description Asset optimization with base64 blur placeholders for Cloudflare R2
 */

import {
  PutObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'

import {
  PROCESSING_RULES,
  PLACEHOLDER_CONFIG,
  DEFAULT_CONFIG,
} from './rules.js'
import {
  getFileHash,
  getContentType,
  getOutputPath,
  logProcessing,
  handleProcessingError,
  createR2Client,
} from './utils.js'

const MANIFEST_ENTRY_VERSION = 2
const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.eot', '.otf'])
const DOCUMENT_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.txt',
  '.rtf',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
])
const PASSTHROUGH_EXTENSIONS = new Set([
  '.svg',
  '.pdf',
  ...FONT_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
])

/**
 * Enhanced asset processor with placeholder generation
 * @class AssetProcessor
 */
export class AssetProcessor {
  /** @type {import('@aws-sdk/client-s3').S3Client} */
  s3Client

  /** @type {string} */
  bucketName

  /** @type {string} */
  manifestPath

  /** @type {{processed: Object, storage: {used: number, limit: number, percentage: number}}} */
  manifest

  // Enhanced rules with placeholder configuration
  RULES = PROCESSING_RULES

  // Placeholder configuration
  PLACEHOLDER_CONFIG = PLACEHOLDER_CONFIG

  constructor() {
    // Validate environment variables and create S3 client
    this.s3Client = createR2Client()
    this.bucketName = process.env.R2_BUCKET_NAME

    if (!this.bucketName) {
      throw new Error('❌ Missing R2_BUCKET_NAME environment variable')
    }

    this.sourcePath = path.resolve(process.cwd(), DEFAULT_CONFIG.sourcePath)
    this.manifestPath = path.resolve(
      process.cwd(),
      DEFAULT_CONFIG.manifestPath
    )
    this.manifestLoaded = false
    this.manifest = {
      processed: {},
      storage: { used: 0, limit: 10737418240, percentage: 0 },
    }

    // Default runtime config; can be overridden by assets.config.js in project root
    this.config = { ...DEFAULT_CONFIG }
    this.outputOwners = new Map()
  }

  /**
   * Generate a base64-encoded blur placeholder
   * @param {string} inputPath - Path to the source image
   * @returns {Promise<{base64: string, metadata: {width: number, height: number, aspectRatio: number}}>}
   */
  async generatePlaceholder(inputPath) {
    try {
      // Get original image metadata first
      const metadata = await sharp(inputPath).metadata()

      // Calculate aspect ratio for proper sizing
      const aspectRatio = metadata.width / metadata.height
      const placeholderHeight = Math.round(
        this.PLACEHOLDER_CONFIG.width / aspectRatio
      )

      // Generate tiny placeholder image
      const placeholderBuffer = await sharp(inputPath)
        .resize(this.PLACEHOLDER_CONFIG.width, placeholderHeight, {
          fit: 'inside',
          kernel: sharp.kernel.cubic, // Smoother downsampling for blur
        })
        .blur(this.PLACEHOLDER_CONFIG.blur) // Apply initial blur
        .webp({
          quality: this.PLACEHOLDER_CONFIG.quality,
          effort: 0, // Fast encoding for placeholders
        })
        .toBuffer()

      // Convert to base64
      const base64 = `data:image/webp;base64,${placeholderBuffer.toString(
        'base64'
      )}`

      // Return placeholder data with metadata
      return {
        base64,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          aspectRatio,
        },
      }
    } catch (error) {
      handleProcessingError(inputPath, error, 'generating placeholder')
      return null
    }
  }

  /**
   * Generate CSS filter for progressive blur removal
   * @param {number} aspectRatio - Image aspect ratio
   * @returns {string} CSS for blur effect
   */
  generatePlaceholderCSS(aspectRatio) {
    return `
      .image-placeholder {
        position: relative;
        overflow: hidden;
        background-size: cover;
        background-position: center;
        filter: blur(20px);
        transform: scale(1.1); /* Prevent blur edge artifacts */
        transition: filter 0.3s ease-out, transform 0.3s ease-out;
      }
      
      .image-placeholder::before {
        content: "";
        display: block;
        padding-bottom: ${(1 / aspectRatio) * 100}%;
      }
      
      .image-placeholder.loaded {
        filter: blur(0);
        transform: scale(1);
      }
    `
  }

  /**
   * Initialize - load existing manifest if it exists
   */
  async init(projectRoot = process.cwd()) {
    // Load optional project-level config (assets.config.js)
    const configPath = path.join(projectRoot, 'assets.config.js')
    let configExists = true
    try {
      await fs.access(configPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      configExists = false
    }

    if (configExists) {
      try {
        const url = pathToFileURL(configPath).href
        // dynamic import to respect ESM config file
        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        const imported = await import(url)
        const projectConfig = imported?.default || imported
        this.config = { ...this.config, ...projectConfig }
        console.log('📋 Loaded assets.config.js')
      } catch (error) {
        throw new Error(`Failed to load assets.config.js: ${error.message}`, {
          cause: error,
        })
      }
    } else {
      console.log('📋 Using default asset config')
    }

    this.sourcePath = path.resolve(projectRoot, this.config.sourcePath)
    this.manifestPath = path.resolve(projectRoot, this.config.manifestPath)

    try {
      const data = await fs.readFile(this.manifestPath, 'utf-8')
      this.manifest = JSON.parse(data)
      this.manifestLoaded = true
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to load asset manifest: ${error.message}`, {
          cause: error,
        })
      }
      console.log('📝 Creating new manifest')
    }
  }

  getImageQuality(size, format) {
    const quality = this.config.quality || DEFAULT_CONFIG.quality
    const formatQuality = quality[format]

    if (typeof formatQuality === 'number') return formatQuality
    if (formatQuality && typeof formatQuality === 'object') {
      const defaults = DEFAULT_CONFIG.quality[format]
      return (
        formatQuality[size] ??
        formatQuality.original ??
        defaults[size] ??
        defaults.original
      )
    }

    if (typeof quality[size] === 'number') return quality[size]
    if (typeof quality.original === 'number') return quality.original

    const defaults = DEFAULT_CONFIG.quality[format]
    return defaults[size] ?? defaults.original
  }

  /**
   * Enhanced optimize image method
   */
  async optimizeImage(inputPath, size, format) {
    try {
      let pipeline = sharp(inputPath)

      // Resize if not original
      if (size !== 'original') {
        pipeline = pipeline
          .resize(size, size, {
            fit: 'inside',
            withoutEnlargement: true,
            kernel: sharp.kernel.lanczos3,
          })
          .sharpen({ sigma: 0.5 })
      }

      // Strip unnecessary metadata
      pipeline = pipeline.rotate().withMetadata({
        orientation: undefined,
      })

      // Convert to format with adaptive quality
      if (format === 'webp') {
        const quality = this.getImageQuality(size, format)
        pipeline = pipeline.webp({
          quality,
          effort: 6,
          smartSubsample: true,
        })
      } else if (format === 'avif') {
        const quality = this.getImageQuality(size, format)
        pipeline = pipeline.avif({
          quality,
          effort: 6,
          chromaSubsampling:
            size !== 'original' && size > 800 ? '4:2:0' : '4:4:4',
        })
      }

      return await pipeline.toBuffer()
    } catch (error) {
      handleProcessingError(inputPath, error, 'optimization failed')
      return null
    }
  }

  /**
   * Enhanced process file with placeholder generation
   */
  async processFile(filePath, relativePath) {
    const ext = path.extname(filePath).toLowerCase()
    const rule = this.config.rules?.[ext] || this.RULES[ext]

    if (!rule) {
      logProcessing(relativePath, 'Skipping unsupported')
      return
    }

    if (rule.skip) {
      logProcessing(relativePath, 'Skipping optimized')
      return
    }

    this.claimOutputKeys(
      relativePath,
      this.getPlannedOutputKeys(relativePath, ext, rule)
    )

    // Check if file has changed
    const hash = await this.getFileHash(filePath)
    const existing = this.manifest.processed[relativePath]

    if (
      this.config.skipUnchanged &&
      existing &&
      existing.hash === hash &&
      existing.version === MANIFEST_ENTRY_VERSION
    ) {
      logProcessing(relativePath, 'Unchanged')
      return
    }

    console.log(`🎨 Processing: ${relativePath}`)

    const outputs = []
    let placeholder = null

    const upload = async (content, key) => {
      const uploaded = await this.uploadToR2(content, key, { overwrite: true })
      if (!uploaded) {
        throw new Error(`Failed to upload ${key}; manifest was not updated`)
      }
      outputs.push(key)
    }

    // Generate placeholder for supported image types if enabled in config
    if (rule.generatePlaceholder && this.config.enablePlaceholders) {
      logProcessing(relativePath, 'Generating placeholder')
      placeholder = await this.generatePlaceholder(filePath)
      if (placeholder) {
        logProcessing(
          relativePath,
          'Placeholder created',
          `${placeholder.base64.length} bytes`
        )
      }
    }

    if (ext === '.svg') {
      const optimized = await this.optimizeSVG(filePath)
      await upload(optimized, relativePath)
    } else if (ext === '.pdf') {
      const compressed = await this.compressPDF(filePath)
      await upload(compressed, relativePath)
    } else if (FONT_EXTENSIONS.has(ext)) {
      // Fonts: upload as-is, no processing
      const buffer = await fs.readFile(filePath)
      await upload(buffer, relativePath)
    } else if (DOCUMENT_EXTENSIONS.has(ext)) {
      // Process other document types
      const processed = await this.processDocument(filePath, ext)
      await upload(processed, relativePath)
    } else {
      // Process images with multiple formats and sizes
      const original = await fs.readFile(filePath)
      await upload(original, relativePath)

      for (const format of rule.outputs) {
        for (const size of rule.sizes) {
          const outputPath = this.getOutputPath(relativePath, size, format)
          const processed = await this.optimizeImage(filePath, size, format)

          if (!processed) {
            throw new Error(
              `Failed to generate ${outputPath}; manifest was not updated`
            )
          }
          await upload(processed, outputPath)
        }
      }
    }

    // Update manifest with placeholder data
    const stats = await fs.stat(filePath)
    this.manifest.processed[relativePath] = {
      version: MANIFEST_ENTRY_VERSION,
      hash,
      outputs,
      size: stats.size,
      updated: new Date().toISOString(),
      // Add placeholder data if generated
      ...(placeholder && {
        placeholder: {
          base64: placeholder.base64,
          width: placeholder.metadata.width,
          height: placeholder.metadata.height,
          aspectRatio: placeholder.metadata.aspectRatio,
        },
      }),
    }

    console.log(
      `   ✅ Created ${outputs.length} versions${
        placeholder ? ' with placeholder' : ''
      }`
    )
  }

  getPlannedOutputKeys(relativePath, ext, rule) {
    if (PASSTHROUGH_EXTENSIONS.has(ext)) return [relativePath]

    const keys = [relativePath]

    for (const format of rule.outputs || []) {
      for (const size of rule.sizes || []) {
        keys.push(this.getOutputPath(relativePath, size, format))
      }
    }

    return keys
  }

  claimOutputKeys(relativePath, outputKeys) {
    this.outputOwners ||= new Map()
    const uniqueKeys = new Set(outputKeys)
    if (uniqueKeys.size !== outputKeys.length) {
      throw new Error(
        `Processing rules for ${relativePath} generate the same R2 key more than once`
      )
    }

    for (const key of uniqueKeys) {
      const owner = this.outputOwners.get(key)
      if (owner && owner !== relativePath) {
        throw new Error(
          `R2 output collision: ${relativePath} and ${owner} both generate ${key}. ` +
            'Use unique basenames per directory.'
        )
      }
      this.outputOwners.set(key, relativePath)
    }
  }

  /**
   * Process all assets
   */
  async processAll() {
    this.outputOwners = new Map()
    const placeholderMsg = this.config.enablePlaceholders
      ? 'with placeholder generation'
      : 'placeholders disabled'
    console.log(`🚀 Starting asset processing (${placeholderMsg})...\n`)

    // Process images
    const imagesDir = path.join(this.sourcePath, 'images')
    if (await this.directoryExists(imagesDir)) {
      await this.processDirectory(imagesDir, 'images')
    }

    // Process documents
    const docsDir = path.join(this.sourcePath, 'documents')
    if (await this.directoryExists(docsDir)) {
      await this.processDirectory(docsDir, 'documents')
    }

    // Process fonts
    const fontsDir = path.join(this.sourcePath, 'fonts')
    if (await this.directoryExists(fontsDir)) {
      await this.processDirectory(fontsDir, 'fonts')
    }

    // Process additional directories from config (e.g. 'footnotes', 'downloads')
    const extraDirs = this.config.directories || []
    for (const dir of extraDirs) {
      const dirPath = path.join(this.sourcePath, dir)
      if (await this.directoryExists(dirPath)) {
        await this.processDirectory(dirPath, dir)
      }
    }

    // Update storage info
    await this.updateStorageInfo()

    // Save enhanced manifest with placeholders
    await this.saveManifest()

    // Generate placeholder stats
    this.printPlaceholderStats()

    if (this.config.enablePlaceholders) {
      console.log('\n✨ Processing complete with placeholders!')
    } else {
      console.log('\n✨ Processing complete (placeholders disabled)!')
    }
    this.printStorageStatus()
  }

  /**
   * Print placeholder generation statistics
   */
  printPlaceholderStats() {
    if (!this.config.enablePlaceholders) return

    const withPlaceholders = Object.values(this.manifest.processed).filter(
      (entry) => entry.placeholder
    ).length
    const totalImages = Object.values(this.manifest.processed).filter(
      (entry) => {
        const ext = path.extname(
          Object.keys(this.manifest.processed).find(
            (key) => this.manifest.processed[key] === entry
          )
        )
        return ['.jpg', '.jpeg', '.png'].includes(ext)
      }
    ).length

    if (totalImages > 0) {
      console.log('\n📊 Placeholder Generation:')
      console.log(`  Generated: ${withPlaceholders}/${totalImages} images`)

      // Calculate average placeholder size
      const placeholderSizes = Object.values(this.manifest.processed)
        .filter((entry) => entry.placeholder)
        .map((entry) => entry.placeholder.base64.length)

      if (placeholderSizes.length > 0) {
        const avgSize = Math.round(
          placeholderSizes.reduce((a, b) => a + b, 0) / placeholderSizes.length
        )
        console.log(`  Avg size: ${avgSize} bytes`)
      }
    }
  }

  // ... (include all other existing methods from your processor.js)
  // The rest of the methods remain the same as in your current implementation

  async directoryExists(dir) {
    try {
      const stats = await fs.stat(dir)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  async processDirectory(dir, basePrefix) {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        const newPrefix = path.posix.join(basePrefix, entry.name)
        await this.processDirectory(fullPath, newPrefix)
      } else if (entry.isFile()) {
        const relativePath = path.posix.join(basePrefix, entry.name)
        await this.processFile(fullPath, relativePath)
      }
    }
  }

  async getFileHash(filePath) {
    return await getFileHash(filePath)
  }

  getOutputPath(originalPath, size, format) {
    return getOutputPath(originalPath, size, format)
  }

  getContentType(key) {
    return getContentType(key)
  }

  async optimizeSVG(inputPath) {
    // Placeholder for SVGO integration
    return await fs.readFile(inputPath)
  }

  async compressPDF(inputPath) {
    // Placeholder for Ghostscript integration
    // For now, just return the original file
    // TODO: Implement PDF compression with Ghostscript or similar
    return await fs.readFile(inputPath)
  }

  async processDocument(inputPath, ext) {
    // Handle different document types
    switch (ext) {
      case '.pdf':
        return await this.compressPDF(inputPath)
      case '.txt':
        return await this.optimizeText(inputPath)
      default:
        // For other documents, just return as-is
        return await fs.readFile(inputPath)
    }
  }

  async optimizeText(inputPath) {
    // Basic text optimization - could add minification, encoding conversion, etc.
    const content = await fs.readFile(inputPath, 'utf8')
    // For now, just return the content as buffer
    return Buffer.from(content, 'utf8')
  }

  async checkObjectExists(key) {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      )
      return true
    } catch (error) {
      // If error is NotFound, object doesn't exist
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false
      }
      throw new Error(`Failed to check whether ${key} exists: ${error.message}`, {
        cause: error,
      })
    }
  }

  async uploadToR2(content, key, { overwrite = false } = {}) {
    try {
      // Check if object already exists
      if (!overwrite && (await this.checkObjectExists(key))) {
        logProcessing(key, 'Already exists')
        return true
      }

      const contentType = this.getContentType(key)

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: content,
          ContentType: contentType,
          CacheControl:
            'public, max-age=3600, stale-while-revalidate=86400',
        })
      )

      logProcessing(key, overwrite ? 'Uploaded/updated' : 'Uploaded')
      return true
    } catch (error) {
      handleProcessingError(key, error, 'upload failed')
      return false
    }
  }

  async getStorageStatus() {
    try {
      let continuationToken
      let used = 0

      do {
        const response = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            ContinuationToken: continuationToken,
          })
        )

        used +=
          response.Contents?.reduce(
            (total, obj) => total + (obj.Size || 0),
            0
          ) || 0
        continuationToken = response.NextContinuationToken
      } while (continuationToken)

      return {
        used,
        limit: this.manifest.storage.limit,
        percentage: Math.round((used / this.manifest.storage.limit) * 100),
      }
    } catch (error) {
      throw new Error(`Failed to get R2 storage status: ${error.message}`, {
        cause: error,
      })
    }
  }

  async updateStorageInfo() {
    const status = await this.getStorageStatus()
    this.manifest.storage = status
  }

  async saveManifest() {
    const dir = path.dirname(this.manifestPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      this.manifestPath,
      JSON.stringify(this.manifest, null, 2)
    )
    console.log('\n💾 Manifest saved')
  }

  printStorageStatus() {
    const { used, limit, percentage } = this.manifest.storage
    const usedGB = (used / 1024 / 1024 / 1024).toFixed(2)
    const limitGB = (limit / 1024 / 1024 / 1024).toFixed(0)

    console.log('\n📊 Storage Status:')
    console.log(`  Used: ${usedGB} GB / ${limitGB} GB (${percentage}%)`)

    if (percentage > 90) {
      console.log('  ⛔ CRITICAL: Storage usage above 90%!')
    } else if (percentage > 80) {
      console.log('  ⚠️  WARNING: Storage usage above 80%')
    }
  }
}

export default AssetProcessor
