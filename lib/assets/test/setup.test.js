import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const setupPath = path.resolve(testDir, '..', 'setup.js')

function runSetup(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [setupPath], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

test('setup creates a safe non-interactive consumer configuration', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-setup-test-'))
  await fs.writeFile(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ scripts: {}, pnpm: { overrides: { yaml: '^2.9.0' } } })
  )
  await fs.writeFile(
    path.join(tempDir, '.env.example'),
    'R2_SECRET_ACCESS_KEY=replace-me\n'
  )

  try {
    const result = await runSetup(tempDir)
    assert.equal(result.code, 0, result.stderr)

    const envStat = await fs.stat(path.join(tempDir, '.env'))
    if (process.platform !== 'win32') {
      assert.equal(envStat.mode & 0o777, 0o600)
    }

    const gitignore = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf8')
    assert.match(gitignore, /^\.env\*$/m)
    assert.match(gitignore, /^!\.env\.example$/m)
    assert.match(gitignore, /^\.dev\.vars\*$/m)

    const pkg = JSON.parse(
      await fs.readFile(path.join(tempDir, 'package.json'), 'utf8')
    )
    assert.deepEqual(pkg.pnpm.overrides, { yaml: '^2.9.0' })
    assert.deepEqual(pkg.pnpm.onlyBuiltDependencies, ['sharp'])
    assert.equal(pkg.scripts['assets:sync'], 'node lib/assets/cli/sync.js')

    const config = await fs.readFile(
      path.join(tempDir, 'assets.config.js'),
      'utf8'
    )
    assert.equal(config.includes('enableAVIF'), false)
    assert.match(config, /export const IMAGE_VARIANT_SIZES/)
    assert.match(config, /outputs: \['webp'\]/)
    const importedConfig = await import(
      `${pathToFileURL(path.join(tempDir, 'assets.config.js')).href}?setup-test`
    )
    assert.deepEqual(importedConfig.IMAGE_VARIANT_SIZES, [400, 800, 1200])
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
