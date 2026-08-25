# Migrating an Existing Astro Project

## Steps

### 1. Copy files into your project

```
lib/assets/          → lib/assets/
src/components/ui/   → src/components/ui/   (R2Image.astro, optionally R2Picture.astro)
src/lib/r2-utils.ts  → src/lib/r2-utils.ts
src/config/r2-images.ts → src/config/r2-images.ts
assets.config.js     → assets.config.js
.env.example         → .env.example
```

Keep the JavaScript files in `workers/`, then choose a worker pattern:

- **Pattern A** (separate CDN worker): keep `workers/worker-assets.js` and copy
  `workers/wrangler-assets.toml` → `wrangler-assets.toml`
- **Pattern B** (single worker): keep `workers/worker-single.js` and copy
  `workers/wrangler-single.toml` → `wrangler.toml`

Keep `workers/r2-response.js` beside the selected worker. It imports the root
`assets.config.js` so the worker and processor share responsive widths.

### 2. Install dependencies

Requires Node.js 20.9 or newer.

```bash
pnpm add -D sharp@0.35.3 @aws-sdk/client-s3@3.1116.0 dotenv@17.4.2 wrangler
```

Prefer pnpm for this template. Commit the generated `pnpm-lock.yaml` in the
consuming project and run `pnpm audit` as part of regular maintenance.
The template pins direct dependency versions and `packageManager`; review those
pins during scheduled maintenance rather than relying on floating ranges.
Add `"pnpm": { "onlyBuiltDependencies": ["sharp"] }` to the consuming
`package.json` without removing existing pnpm settings.

### 3. Configure

Update `src/lib/r2-utils.ts` and `src/config/r2-images.ts` with your CDN domain.

Copy `.env.example` to `.env` and fill in your R2 credentials.

### 4. Add package scripts to package.json

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

### 5. Create R2 bucket

```bash
wrangler r2 bucket create your-bucket-name
```

### 6. Process and upload assets

Place images in `public/images/`, fonts in `public/fonts/`, etc.

```bash
pnpm run assets:sync
```

### 7. Update components

Replace `<Image>` or `<img>` tags with `<R2Image>`:

```astro
// Before
<Image src="/images/books/cover.webp" alt="Cover" width={400} />

// After
import R2Image from '../components/ui/R2Image.astro'
<R2Image src="books/cover.webp" alt="Cover" width={400} />
```

Note: `src` should be relative to the `images/` directory, without the leading `/images/`.

### 8. Update .gitignore

```
public/images/
public/fonts/
public/documents/
public/assets-manifest.json
.env*
!.env.example
.dev.vars*
```

Remove assets from git tracking (they stay on disk):

```bash
git rm -r --cached public/images/ public/fonts/
```

### 9. Deploy worker

```bash
# Pattern A
wrangler deploy --config wrangler-assets.toml

# Pattern B
wrangler deploy
```

Pattern B expects the Astro project to generate `dist/404.html` and configures
Cloudflare's `404-page` handling. Add `src/pages/404.astro` in consumers that do
not already produce that file.

### 10. Update font references

If you have `@font-face` in CSS, update URLs to point to your CDN:

```css
@font-face {
  font-family: 'MyFont';
  src: url('https://cdn.yourproject.com/fonts/MyFont.woff2') format('woff2');
}
```

## Development

After cloning the repo (images are gitignored), pull them from R2:

```bash
pnpm run dev:images:pull
```

Images load from local `public/images/` in dev mode, R2 CDN in production.

## Security

Keep `pnpm-lock.yaml` committed and run `pnpm audit` before dependency updates.
Treat SVG files as trusted static assets unless you add explicit sanitization in
your project.

## Managed consumer rollout

This template supports a coordinated maintenance rollout across these sites:

| Repository | Role/status |
| --- | --- |
| `jantonca/josemi-anton-resume` | Completed reference implementation |
| `bobeliadesign/bobeliadesign.com` | Pending migration |
| `bobeliadesign/lindajaivin-com.au-2025` | Pending migration |
| `bobeliadesign/aidatomescu.com` | Pending migration |

Treat each migration as a separate audited change. Preserve its CDN domains,
bucket names, source paths, responsive sizes, framework versions, deployment
pattern, and component conventions; do not assume the repositories have
identical copies of these utilities.

## Updating an existing consumer to 1.1.0

Use this checklist for each pending repository above and any other repository
that copies these utilities:

1. Record any local changes to the copied asset files; do not overwrite custom
   CDN domains, bucket names, image sizes, or processing rules. Move root-level
   worker JavaScript files into `workers/` or adjust the config import paths.
2. Update `lib/assets/core/`, `lib/assets/cli/`, and `lib/assets/setup.js`.
3. Copy `workers/r2-response.js`, update the selected worker, and define custom
   responsive widths once in `assets.config.js` as `IMAGE_VARIANT_SIZES`. For
   Pattern B, merge the `ASSETS` binding, `run_worker_first` routes, and
   `404-page` handling into the consumer's Wrangler configuration. Because the
   worker bundle imports `assets.config.js`, keep that file free of Node.js-only
   imports.
4. Update `R2Image.astro`, `R2Picture.astro`, and `src/lib/r2-utils.ts` while
   preserving project-specific component paths and CDN configuration.
5. Upgrade Sharp and the AWS SDK, add the narrow Sharp build allowlist, and
   regenerate the consumer's own lockfile.
6. Run `assets:sync` once. Manifest versioning will reprocess existing sources
   and upload their originals so `dev:images:pull` can restore them later.
7. Run the consumer's normal Astro typecheck/build plus `check:assets`, a Sharp
   smoke test, and a Wrangler dry-run. Do not deploy as part of the migration
   unless deployment is separately requested and approved.

Source files in the same directory must have unique basenames because their
responsive variants share extension-independent keys. Version 1.1.0 rejects a
collision before uploading instead of silently overwriting another source.

The Astro/Tailwind versions of a consuming site are independent of this template
and should not be changed merely to adopt the R2 maintenance release.

## Rollback

Revert component changes and add images back to git. The R2 worker can stay deployed harmlessly.
