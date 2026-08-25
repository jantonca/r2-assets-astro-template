#!/usr/bin/env node

/**
 * Setup script for R2 Asset Processor
 * Helps users configure the package for their project
 */

import fs from 'fs/promises'
import path from 'path'

const DEFAULT_ENV_CONTENT = `# Cloudflare R2 Configuration
# Find these in: Cloudflare Dashboard > R2 > Manage API Tokens

CF_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-bucket-name
`

async function setup() {
  console.log('🚀 R2 Asset Processor Setup\n')

  await ensureEnvFile()

  // Add to .gitignore
  await ensureGitignore()

  // Create folder structure
  console.log('\n📁 Creating folder structure...')
  await fs.mkdir('public/images', { recursive: true })
  await fs.mkdir('public/documents', { recursive: true })
  await fs.mkdir('public/fonts', { recursive: true })

  // Create .gitkeep files to maintain directory structure (only if they don't exist)
  const imagesGitkeep = path.join('public', 'images', '.gitkeep')
  const docsGitkeep = path.join('public', 'documents', '.gitkeep')

  if (!(await fileExists(imagesGitkeep))) {
    await fs.writeFile(imagesGitkeep, '')
  }
  if (!(await fileExists(docsGitkeep))) {
    await fs.writeFile(docsGitkeep, '')
  }

  // Create example config
  await createExampleConfig()

  // Add package scripts
  await updatePackageJson()

  console.log('\n✅ Setup complete!')
  console.log('\n📚 Next steps:')
  console.log('  1. Edit .env and replace every placeholder value')
  console.log('  2. Place images in public/images/')
  console.log('  3. Run: pnpm run assets:sync')
  console.log('  4. Check status: pnpm run assets:status')
  console.log('\n💡 Customize processing in assets.config.js')
}

async function ensureEnvFile() {
  const envPath = path.join(process.cwd(), '.env')
  if (await fileExists(envPath)) {
    console.log('🔒 Existing .env left unchanged')
    return
  }

  const examplePath = path.join(process.cwd(), '.env.example')
  try {
    await fs.copyFile(examplePath, envPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await fs.writeFile(envPath, DEFAULT_ENV_CONTENT)
  }

  await fs.chmod(envPath, 0o600)
  console.log('🔒 Created .env with owner-only permissions')
}

async function fileExists(path) {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function ensureGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore')
  let content = ''

  try {
    content = await fs.readFile(gitignorePath, 'utf-8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const toAdd = [
    '.env',
    '.env*',
    '!.env.example',
    '.dev.vars*',
    'public/assets-manifest.json',
    '*.log',
    'public/images/',
    'public/documents/',
    'public/fonts/',
  ]

  const lines = content.split('\n')
  const additions = []

  for (const item of toAdd) {
    if (!lines.includes(item)) {
      additions.push(item)
    }
  }

  if (additions.length > 0) {
    const newContent =
      content +
      (content.endsWith('\n') ? '' : '\n') +
      '\n# R2 Asset Processor (served from Cloudflare R2, not stored in repo)\n' +
      additions.join('\n') +
      '\n'
    await fs.writeFile(gitignorePath, newContent)
    console.log('✅ Updated .gitignore')
  }
}

async function createExampleConfig() {
  const configPath = path.join(process.cwd(), 'assets.config.js')

  if (await fileExists(configPath)) {
    return // Don't overwrite existing config
  }

  const configContent = `/**
 * R2 Asset Processor Configuration
 * Customize processing rules and options
 */

export const IMAGE_VARIANT_SIZES = [400, 800, 1200]

export default {
  // Source paths
  sourcePath: 'public',
  manifestPath: 'public/assets-manifest.json',
  
  // Quality settings per format and size
  quality: {
    webp: { 400: 90, 800: 85, 1200: 80, original: 80 },
    avif: { 400: 75, 800: 65, 1200: 55, original: 55 }
  },
  
  // Features
  enablePlaceholders: false,
  skipUnchanged: true,
  
  // Custom processing rules
  rules: {
    '.jpg': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.jpeg': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.png': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.gif': { outputs: ['webp'], sizes: ['original'] },
    '.svg': { outputs: ['svg'], sizes: ['original'], optimize: true },
    '.pdf': { outputs: ['pdf'], sizes: ['original'], compress: true },
    '.webp': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.avif': { outputs: ['avif'], sizes: IMAGE_VARIANT_SIZES }
  }
}
`

  await fs.writeFile(configPath, configContent)
  console.log('✅ Created assets.config.js')
}

async function updatePackageJson() {
  const packagePath = path.join(process.cwd(), 'package.json')

  try {
    const content = await fs.readFile(packagePath, 'utf-8')
    const pkg = JSON.parse(content)

    // Add scripts if they don't exist
    if (!pkg.scripts) pkg.scripts = {}

    const scripts = {
      'assets:sync': 'node lib/assets/cli/sync.js',
      'assets:status': 'node lib/assets/cli/status.js',
      'assets:setup': 'node lib/assets/setup.js',
      'dev:images': 'node lib/assets/cli/dev-images.js',
      'dev:images:pull': 'node lib/assets/cli/dev-images.js pull',
      'dev:images:check': 'node lib/assets/cli/dev-images.js check',
      'check:assets': 'cd lib/assets && pnpm run check',
    }

    let updated = false
    for (const [key, value] of Object.entries(scripts)) {
      if (!pkg.scripts[key]) {
        pkg.scripts[key] = value
        updated = true
      }
    }

    if (!pkg.pnpm) pkg.pnpm = {}
    const allowedBuilds = Array.isArray(pkg.pnpm.onlyBuiltDependencies)
      ? pkg.pnpm.onlyBuiltDependencies
      : []
    if (!allowedBuilds.includes('sharp')) {
      pkg.pnpm.onlyBuiltDependencies = [...allowedBuilds, 'sharp']
      updated = true
    }

    if (updated) {
      await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2))
      console.log('✅ Updated package.json scripts')
    }
  } catch (error) {
    console.log(
      '⚠️  Could not update package.json. Add these scripts manually:'
    )
    console.log('  "assets:sync": "node lib/assets/cli/sync.js"')
    console.log('  "assets:status": "node lib/assets/cli/status.js"')
    console.log('  "assets:setup": "node lib/assets/setup.js"')
    console.log('  "dev:images": "node lib/assets/cli/dev-images.js"')
    console.log('  "dev:images:pull": "node lib/assets/cli/dev-images.js pull"')
    console.log('  "dev:images:check": "node lib/assets/cli/dev-images.js check"')
    console.log('  "check:assets": "cd lib/assets && pnpm run check"')
    console.log('  "pnpm": { "onlyBuiltDependencies": ["sharp"] }')
  }
}

// Run setup
setup().catch((error) => {
  console.error('❌ Setup failed:', error.message)
  process.exitCode = 1
})
