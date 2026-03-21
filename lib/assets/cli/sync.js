#!/usr/bin/env node
import dotenv from 'dotenv'
dotenv.config()

import AssetProcessor from '../core/processor.js'
import { validateEnvironment } from '../core/utils.js'

async function main() {
  try {
    validateEnvironment()

    // Initialize processor and load config
    const processor = new AssetProcessor()
    await processor.init()

    // Process all assets
    await processor.processAll()
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()
