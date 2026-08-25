/**
 * R2 Asset Processor Configuration
 * Customize processing rules and options for your project
 */

// Shared by the processor and combined worker. Keep responsive widths here so
// format negotiation, Save-Data handling, and generated variants stay aligned.
export const IMAGE_VARIANT_SIZES = [400, 800, 1200]

export default {
  // Source paths
  sourcePath: 'public',
  manifestPath: 'public/assets-manifest.json',

  // Quality settings per format and size
  quality: {
    webp: { 400: 90, 800: 85, 1200: 80, original: 80 },
    avif: { 400: 75, 800: 65, 1200: 55, original: 55 },
  },

  // Features
  enablePlaceholders: false,
  skipUnchanged: true,

  // Additional directories to scan (beyond images, documents, fonts)
  // directories: ['footnotes', 'downloads'],

  // Custom processing rules
  rules: {
    '.jpg': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.jpeg': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.png': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.gif': { outputs: ['webp'], sizes: ['original'] },
    '.svg': { outputs: ['svg'], sizes: ['original'], optimize: true },
    '.webp': { outputs: ['webp'], sizes: IMAGE_VARIANT_SIZES },
    '.avif': { outputs: ['avif'], sizes: IMAGE_VARIANT_SIZES },
    '.pdf': { outputs: ['pdf'], sizes: ['original'], generatePlaceholder: false },
    '.woff2': { outputs: ['woff2'], sizes: ['original'], generatePlaceholder: false },
    '.woff': { outputs: ['woff'], sizes: ['original'], generatePlaceholder: false },
    '.ttf': { outputs: ['ttf'], sizes: ['original'], generatePlaceholder: false },
  },
}
