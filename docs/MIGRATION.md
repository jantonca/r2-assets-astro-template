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

Choose a worker pattern and copy it to your project root:
- **Pattern A** (separate CDN worker): `workers/worker-assets.js` → `worker-assets.js` + `workers/wrangler-assets.toml` → `wrangler-assets.toml`
- **Pattern B** (single worker): `workers/worker-single.js` → `worker.js` + `workers/wrangler-single.toml` → `wrangler.toml`

### 2. Install dependencies

```bash
npm install -D sharp @aws-sdk/client-s3 dotenv
# or
pnpm add -D sharp @aws-sdk/client-s3 dotenv
```

### 3. Configure

Update `src/lib/r2-utils.ts` and `src/config/r2-images.ts` with your CDN domain.

Copy `.env.example` to `.env` and fill in your R2 credentials.

### 4. Add npm scripts to package.json

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

### 5. Create R2 bucket

```bash
wrangler r2 bucket create your-bucket-name
```

### 6. Process and upload assets

Place images in `public/images/`, fonts in `public/fonts/`, etc.

```bash
npm run assets:sync
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
npm run dev:images:pull
```

Images load from local `public/images/` in dev mode, R2 CDN in production.

## Rollback

Revert component changes and add images back to git. The R2 worker can stay deployed harmlessly.
