# r2-assets-astro-template

Asset processing pipeline for Cloudflare R2. Generates responsive image variants with Sharp, uploads images/fonts/PDFs to R2, and serves them via a Cloudflare Worker with caching. Includes an Astro component with srcset support and a dev workflow to pull assets from R2 locally.

## What it does

- **Images** — Source originals plus responsive WebP variants (400, 800, 1200px by default), with optional AVIF outputs, are uploaded to R2 with a manifest to skip unchanged files
- **Fonts** — Uploaded as-is with proper content-type headers
- **PDFs/Documents** — Uploaded as-is
- **Dev workflow** — Images are gitignored; `dev:images:pull` downloads originals from R2 for local development
- **Astro components** — `R2Image` and `R2Picture` serve from local `/images/` in dev, R2 CDN in production

## Architecture

Two deployment patterns are included. Choose one:

### Pattern A: Separate CDN worker (recommended for SSR sites)

```
yourproject.com      → Main site worker (Astro SSR adapter)
cdn.yourproject.com  → Assets worker (worker-assets.js) → R2 bucket
```

Use this when your site uses the Astro Cloudflare adapter or any SSR setup that generates its own worker.

### Pattern B: Single worker (recommended for static sites)

```
yourproject.com      → Single worker (worker-single.js) → Static site + R2 bucket
cdn.yourproject.com  ↗
```

Use this when your site is fully static. One worker serves both the site and R2 assets. Includes format negotiation and Save-Data support.

## Quick start

### 1. Copy files into your Astro project

```
lib/assets/                    → lib/assets/
src/components/ui/R2Image.astro → src/components/ui/R2Image.astro
src/lib/r2-utils.ts            → src/lib/r2-utils.ts
src/config/r2-images.ts        → src/config/r2-images.ts
assets.config.js               → assets.config.js
```

Copy the `workers/` directory and your chosen Wrangler file into the Astro
project. Keep the worker JavaScript files in `workers/`: the shared response
helper imports `../assets.config.js` so processing and delivery use the same
responsive widths.

### 2. Install dependencies

Requires Node.js 20.9 or newer.

```bash
pnpm add -D sharp@0.35.3 @aws-sdk/client-s3@3.1116.0 dotenv@17.4.2 wrangler
```

For dependency health checks, keep `pnpm-lock.yaml` committed in the consuming
project and run `pnpm audit` during maintenance.

This template pins direct dependency versions and declares `packageManager` for
reproducible installs. Review and update those pins during scheduled maintenance.
Allow only Sharp's required install script in the consuming `package.json`:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["sharp"]
  }
}
```

### 3. Configure

Copy `.env.example` to `.env` and fill in your Cloudflare R2 credentials.

Update the CDN domain in `src/lib/r2-utils.ts` and `src/config/r2-images.ts`.

### 4. Add scripts to package.json

```json
{
  "scripts": {
    "assets:sync": "node lib/assets/cli/sync.js",
    "assets:status": "node lib/assets/cli/status.js",
    "dev:images": "node lib/assets/cli/dev-images.js",
    "dev:images:pull": "node lib/assets/cli/dev-images.js pull",
    "dev:images:check": "node lib/assets/cli/dev-images.js check",
    "check:assets": "cd lib/assets && pnpm run check",
    "deploy:assets": "wrangler deploy --config wrangler-assets.toml"
  }
}
```

### 5. Process and upload

```bash
# Create R2 bucket
wrangler r2 bucket create your-bucket-name

# Place images in public/images/, fonts in public/fonts/, etc.
# Process and upload to R2
pnpm run assets:sync
```

### 6. Deploy worker

```bash
pnpm run deploy:assets
```

## Usage

### R2Image component

```astro
---
import R2Image from '../components/ui/R2Image.astro'
---

<!-- Basic usage -->
<R2Image src="books/cover.webp" alt="Book cover" width={400} />

<!-- With responsive sizes -->
<R2Image
  src="hero.webp"
  alt="Hero image"
  width={1200}
  sizes="(max-width: 768px) 100vw, 50vw"
  loading="eager"
/>

<!-- With aspect ratio container -->
<R2Image
  src="portrait.webp"
  alt="Portrait"
  width={800}
  aspectRatio="3/4"
/>
```

The `src` is relative to `images/` — no leading `/images/` prefix.

### R2Picture component

Use this when you want the browser to choose between AVIF and WebP. The checked-in
default generates WebP only; add `avif` to each relevant `rules[].outputs` entry
and to `src/config/r2-images.ts` before requesting AVIF sources:

```astro
---
import R2Picture from '../components/ui/R2Picture.astro'
---

<R2Picture
  src="artwork.jpg"
  alt="Artwork"
  formats={['avif', 'webp']}
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

## CLI tools

| Command | Description |
|---------|-------------|
| `assets:sync` | Process images and upload to R2. Skips unchanged files. |
| `assets:status` | Show R2 storage usage and processed file counts |
| `dev:images` | Interactive mode — check status and download missing images |
| `dev:images:pull` | Download all missing images from R2 for local dev |
| `dev:images:check` | Check local images against R2 without downloading |
| `check:syntax` | Parse-check the asset processor JavaScript files |
| `audit:deps` | Run `pnpm audit --audit-level low` |
| `test:unit` | Run processor, development-image, and worker regression tests |
| `check` | Run syntax checks, unit tests, and dependency audit |

## Configuration

`assets.config.js` controls processing:

```js
export const IMAGE_VARIANT_SIZES = [400, 800, 1200]

export default {
  sourcePath: 'public',
  manifestPath: 'public/assets-manifest.json',
  quality: {
    webp: { 400: 90, 800: 85, 1200: 80, original: 80 },
    avif: { 400: 75, 800: 65, 1200: 55, original: 55 },
  },
  enablePlaceholders: false,
  skipUnchanged: true,

  // Additional directories beyond images, documents, fonts
  directories: ['footnotes', 'downloads'],

  rules: {
    '.jpg': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.png': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.pdf': { outputs: ['pdf'], sizes: ['original'] },
    '.woff2': { outputs: ['woff2'], sizes: ['original'] },
  },
}
```

Change `IMAGE_VARIANT_SIZES` once when a consumer needs different responsive
widths. The processor, format negotiation, fallback chain, and Save-Data
downgrade all consume that value. Use unique source basenames within each
directory (for example, do not keep both `hero.jpg` and `hero.png`); processing
fails before upload when two sources would overwrite the same generated key.
The worker bundle imports `assets.config.js`, so keep that public configuration
file declarative and free of Node.js-only imports.

Legacy flat quality maps such as `{ 400: 90, 800: 85, 1200: 80 }` remain
supported for existing consumers. Format generation is controlled only by each
rule's `outputs` array.

Manifest entry versioning automatically performs a one-time reprocessing pass
when pipeline behavior changes. Version 1.1.0 uses that pass to upload source
originals required by `dev:images:pull`.

## Security notes

- Keep `pnpm-lock.yaml` committed and run `pnpm audit` before dependency updates.
- SVG files are uploaded as trusted static assets. Do not upload untrusted or user-submitted SVGs unless you add a sanitizer such as SVGO with a hardened preset in the consuming project.
- R2 credentials belong only in `.env` or platform secrets; do not commit them.
- Stable object keys can be overwritten, so the included workers use bounded
  caching rather than `immutable` responses.

## Maintaining this template

Run package checks from the nested asset package:

```bash
cd lib/assets
pnpm install --frozen-lockfile
pnpm run check
```

Worker changes also require a Sharp conversion smoke test and Wrangler dry-runs
for both deployment patterns. See [the changelog](CHANGELOG.md) and
[migration guide](docs/MIGRATION.md) before updating downstream copies.

## File reference

```
lib/assets/
  core/
    processor.js    — Main processing engine (Sharp + S3 upload)
    rules.js        — File type processing rules
    utils.js        — Shared utilities (hashing, R2 client, content types)
  cli/
    sync.js         — CLI: process and upload assets
    status.js       — CLI: show storage status
    dev-images.js   — CLI: download images for local dev
  setup.js          — Non-interactive safe setup helper

src/
  components/ui/
    R2Image.astro   — <img> with srcset (simple, recommended)
    R2Picture.astro — <picture> with format sources (advanced)
  lib/
    r2-utils.ts     — Srcset generation utility
  config/
    r2-images.ts    — CDN domain and image config

workers/
  r2-response.js          — Shared response, cache, MIME, and fallback utilities
  worker-assets.js      — Pattern A: separate CDN worker
  worker-single.js      — Pattern B: combined site + assets worker
  wrangler-assets.toml  — Wrangler config for Pattern A
  wrangler-single.toml  — Wrangler config for Pattern B
```

## Migrating an existing project

See [docs/MIGRATION.md](docs/MIGRATION.md) for step-by-step instructions.

## License

MIT
