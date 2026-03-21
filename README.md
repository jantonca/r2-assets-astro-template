# r2-assets-astro-template

Asset processing pipeline for Cloudflare R2. Generates responsive image variants with Sharp, uploads images/fonts/PDFs to R2, and serves them via a Cloudflare Worker with caching. Includes an Astro component with srcset support and a dev workflow to pull assets from R2 locally.

## What it does

- **Images** — Resized into responsive variants (400, 800, 1200px) in WebP/AVIF, uploaded to R2 with a manifest to skip unchanged files
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

Copy your chosen worker pattern to the project root (see `workers/` directory).

### 2. Install dependencies

```bash
pnpm add -D sharp @aws-sdk/client-s3 dotenv
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

Use this when you want the browser to choose between AVIF and WebP:

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

Requires `enableAVIF: true` in `assets.config.js` to generate AVIF variants.

## CLI tools

| Command | Description |
|---------|-------------|
| `assets:sync` | Process images and upload to R2. Skips unchanged files. |
| `assets:status` | Show R2 storage usage and processed file counts |
| `dev:images` | Interactive mode — check status and download missing images |
| `dev:images:pull` | Download all missing images from R2 for local dev |

## Configuration

`assets.config.js` controls processing:

```js
export default {
  sizes: [400, 800, 1200],
  quality: { 400: 90, 800: 85, 1200: 80 },
  enableAVIF: false,

  // Additional directories beyond images, documents, fonts
  directories: ['footnotes', 'downloads'],

  rules: {
    '.jpg': { outputs: ['webp'], sizes: [400, 800, 1200] },
    '.png': { outputs: ['webp'], sizes: [400, 800, 1200] },
    '.pdf': { outputs: ['pdf'], sizes: ['original'] },
    '.woff2': { outputs: ['woff2'], sizes: ['original'] },
  },
}
```

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
  setup.js          — Interactive setup wizard

src/
  components/ui/
    R2Image.astro   — <img> with srcset (simple, recommended)
    R2Picture.astro — <picture> with format sources (advanced)
  lib/
    r2-utils.ts     — Srcset generation utility
  config/
    r2-images.ts    — CDN domain and image config

workers/
  worker-assets.js      — Pattern A: separate CDN worker
  worker-single.js      — Pattern B: combined site + assets worker
  wrangler-assets.toml  — Wrangler config for Pattern A
  wrangler-single.toml  — Wrangler config for Pattern B
```

## Migrating an existing project

See [docs/MIGRATION.md](docs/MIGRATION.md) for step-by-step instructions.

## License

MIT
