/**
 * Asset Processing Utilities
 * Common functions used across the asset processing pipeline
 */

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { S3Client } from '@aws-sdk/client-s3'

/**
 * Validate required environment variables
 */
export function validateEnvironment() {
  const required = [
    'CF_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variables: ${missing.join(', ')}`
    )
  }

  return {
    accountId: process.env.CF_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
  }
}

/**
 * Check if directory exists
 */
export async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * Generate file hash for change detection
 */
export async function getFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath)
    return crypto.createHash('md5').update(content).digest('hex')
  } catch (error) {
    throw new Error(`Failed to hash file ${filePath}: ${error.message}`, {
      cause: error,
    })
  }
}

/**
 * Get content type for file extension
 */
export function getContentType(key) {
  const ext = path.extname(key).toLowerCase()
  const types = {
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
  return types[ext] || 'application/octet-stream'
}

/**
 * Generate output path for processed files
 */
export function getOutputPath(originalPath, size, format) {
  const ext = path.extname(originalPath)
  const nameWithoutExt = originalPath.replace(ext, '')

  if (size === 'original') {
    return originalPath.replace(ext, `.${format}`)
  }

  return `${nameWithoutExt}-${size}.${format}`
}

/**
 * Log processing status with consistent formatting
 */
export function logProcessing(file, status, details = '') {
  const timestamp = new Date().toLocaleTimeString()
  const detailStr = details ? ` (${details})` : ''
  console.log(`[${timestamp}] ${status}: ${file}${detailStr}`)
}

/**
 * Handle processing errors consistently
 */
export function handleProcessingError(file, error, context = '') {
  const contextStr = context ? ` (${context})` : ''
  console.error(`❌ Error processing ${file}${contextStr}:`, error.message)
}

/**
 * Create S3 client for R2 with validated environment
 */
export function createR2Client() {
  const env = validateEnvironment()

  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  })
}

/**
 * Check if file exists
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
