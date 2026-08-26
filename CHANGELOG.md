# Changelog

## [1.1.1] - 2026-08-26

### Fixed

- Excluded R2 directory markers (zero-byte keys ending in `/`) from development
  image listings and rejected them in `resolveLocalImagePath`. `path.resolve`
  strips the trailing slash, so such a key resolved to the directory's own path
  and was written as a file, after which every later download failed against it.
  The image-extension filter already excluded them incidentally; this makes the
  protection explicit so widening the format list cannot reintroduce the fault.
- Created the destination directory before fetching an object and destroyed the
  response body if the write fails. An unconsumed body keeps its socket checked
  out of the SDK pool, so a run with failing writes exhausted the pool and hung
  instead of reporting the error.

## [1.1.0] - 2026-08-25

### Security

- Upgraded Sharp to 0.35.3 to include patched libvips binaries.
- Restricted pnpm build-script approval to Sharp.
- Replaced interactive secret entry with a permission-restricted `.env`
  template and expanded local secret-file ignore rules.
- Prevented development image downloads from escaping `public/images/`.

### Fixed

- Centralized responsive worker and processor widths in
  `IMAGE_VARIANT_SIZES` and honored custom `sourcePath` in development image
  commands.
- Restored negotiation for unsized variants such as converted GIFs and rejected
  generated-key collisions before upload.
- Prevented GIF requests from selecting a same-basename raster source's sized
  variant and bypassed raster format negotiation for SVG requests.
- Added the missing static-assets binding and Worker-first R2 routes to the
  single-worker Wrangler template.
- Stopped failed uploads and R2 listings from being reported as successful.
- Preserved retry eligibility by updating manifest entries only after all
  expected outputs upload successfully.
- Added manifest entry versioning and source-original uploads so the documented
  development image pull workflow works for processed raster sources.
- Replaced one-year immutable caching for overwriteable keys with bounded
  browser and CDN caching.
- Corrected external image URL handling, original `<picture>` sources, default
  format negotiation, and nearest-size fallback order.
- Made configured source, manifest, and image-quality values effective.

### Changed

- Added `workers/r2-response.js`, which must be copied with either worker.
- Updated `@aws-sdk/client-s3` to 3.1116.0 and the package Node.js floor to
  20.9.0.
- Added processor, development-image, and worker regression tests.
- Centralized processor extension classifications to keep collision planning
  aligned with execution.
