#!/usr/bin/env node

/**
 * Check R2 storage status
 * Usage: pnpm run assets:status
 */

import dotenv from 'dotenv'
dotenv.config()

import AssetProcessor from '../core/processor.js'

async function main() {
  try {
    console.log('📊 Asset Storage Status\n')

    // Check R2 storage
    const processor = new AssetProcessor()
    await processor.init()
    const status = await processor.getStorageStatus()

    const usedGB = (status.used / 1024 / 1024 / 1024).toFixed(2)
    const limitGB = (status.limit / 1024 / 1024 / 1024).toFixed(0)

    console.log('R2 Storage:')
    console.log(`  Used: ${usedGB} GB / ${limitGB} GB`)
    console.log(`  Usage: ${status.percentage}%`)

    // Create visual bar
    const barLength = 30
    const filledLength = Math.round((status.percentage / 100) * barLength)
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
    console.log(`  [${bar}]`)

    if (status.percentage > 90) {
      console.log('\n⛔ CRITICAL: Storage usage above 90%!')
    } else if (status.percentage > 80) {
      console.log('\n⚠️  WARNING: Storage usage above 80%')
    } else {
      console.log('\n✅ Storage usage healthy')
    }

    if (processor.manifestLoaded) {
      const manifest = processor.manifest
      const fileCount = Object.keys(manifest.processed).length
      const totalOutputs = Object.values(manifest.processed).reduce(
        (sum, entry) => sum + entry.outputs.length,
        0
      )

      console.log('\n📁 Processed Files:')
      console.log(`  Source files: ${fileCount}`)
      console.log(`  Output files: ${totalOutputs}`)
    } else {
      console.log('\n📁 No manifest found (run sync first)')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run
main()
