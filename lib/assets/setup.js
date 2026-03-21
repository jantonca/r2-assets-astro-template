#!/usr/bin/env node

/**
 * Setup script for R2 Asset Processor
 * Helps users configure the package for their project
 */

import fs from 'fs/promises'
import path from 'path'
import readline from 'readline/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function setup() {
  console.log('🚀 R2 Asset Processor Setup\n')

  // Check if .env exists
  const envPath = path.join(process.cwd(), '.env')
  const envExists = await fileExists(envPath)

  if (envExists) {
    const overwrite = await rl.question(
      '.env file exists. Add R2 config to it? (y/n): '
    )
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled')
      process.exit(0)
    }
  }

  // Collect configuration
  console.log('\n📝 Enter your Cloudflare R2 credentials:')
  console.log('(Find these in Cloudflare Dashboard > R2 > Manage API Tokens)\n')

  const accountId = await rl.question('Account ID: ')
  const accessKey = await rl.question('Access Key ID: ')
  const secretKey = await rl.question('Secret Access Key: ')
  const bucketName = await rl.question('Bucket Name: ')

  // Create .env content
  const envContent = `
# Cloudflare R2 Configuration
CF_ACCOUNT_ID=${accountId}
R2_ACCESS_KEY_ID=${accessKey}
R2_SECRET_ACCESS_KEY=${secretKey}
R2_BUCKET_NAME=${bucketName}
`

  // Append or create .env
  if (envExists) {
    await fs.appendFile(envPath, envContent)
  } else {
    await fs.writeFile(envPath, envContent.trim())
  }

  // Add to .gitignore
  await ensureGitignore()

  // Create folder structure
  console.log('\n📁 Creating folder structure...')
  await fs.mkdir('public/images', { recursive: true })
  await fs.mkdir('public/documents', { recursive: true })

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

  // Add npm scripts
  await updatePackageJson()

  console.log('\n✅ Setup complete!')
  console.log('\n📚 Next steps:')
  console.log('  1. Place images in public/images/')
  console.log('  2. Run: npm run assets:sync')
  console.log('  3. Check status: npm run assets:status')
  console.log('\n💡 Customize processing in assets.config.js')

  rl.close()
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
  } catch {
    // .gitignore doesn't exist
  }

  const toAdd = [
    '.env',
    'public/assets-manifest.json',
    '*.log',
    'public/images/',
    'public/documents/',
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

export default {
  // Source paths
  sourcePath: 'public',
  manifestPath: 'public/assets-manifest.json',
  
  // Processing sizes (mobile-first)
  sizes: [400, 800, 1200],
  
  // Quality settings per size
  quality: {
    400: 90,   // Mobile - higher quality
    800: 85,   // Tablet
    1200: 80   // Desktop
  },
  
  // Features
  enableWebP: true,
  enableAVIF: true,
  enablePlaceholders: false,
  enableCaching: true,
  
  // Custom processing rules
  rules: {
    '.jpg': { outputs: ['webp', 'avif'], sizes: [400, 800, 1200] },
    '.jpeg': { outputs: ['webp', 'avif'], sizes: [400, 800, 1200] },
    '.png': { outputs: ['webp', 'avif'], sizes: [400, 800, 1200] },
    '.gif': { outputs: ['webp'], sizes: ['original'] },
    '.svg': { outputs: ['svg'], sizes: ['original'], optimize: true },
    '.pdf': { outputs: ['pdf'], sizes: ['original'], compress: true },
    '.webp': { skip: true },
    '.avif': { skip: true }
  },
  
  // Hooks (optional)
  onProgress: ({ file, status }) => {
    // console.log(\`Processing \${file}: \${status}\`)
  },
  
  onError: ({ file, error }) => {
    console.error(\`Error processing \${file}:\`, error.message)
  },
  
  beforeUpload: async ({ key, size }) => {
    // Return false to skip upload
    return true
  },
  
  afterUpload: async ({ key, size }) => {
    // Log or track uploads
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
      'assets:sync': 'node lib/assets/sync.js',
      'assets:status': 'node lib/assets/status.js',
      'assets:setup': 'node lib/assets/setup.js',
    }

    let updated = false
    for (const [key, value] of Object.entries(scripts)) {
      if (!pkg.scripts[key]) {
        pkg.scripts[key] = value
        updated = true
      }
    }

    if (updated) {
      await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2))
      console.log('✅ Updated package.json scripts')
    }
  } catch (error) {
    console.log(
      '⚠️  Could not update package.json. Add these scripts manually:'
    )
    console.log('  "assets:sync": "node lib/assets/sync.js"')
    console.log('  "assets:status": "node lib/assets/status.js"')
  }
}

// Run setup
setup().catch(console.error)
