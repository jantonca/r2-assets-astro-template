/**
 * R2 Asset Processor Configuration
 * Customize processing rules and options for your project
 */

export default {
  // Source paths
  sourcePath: 'public',
  manifestPath: 'public/assets-manifest.json',

  // Processing sizes (mobile-first)
  sizes: [400, 800, 1200],

  // Quality settings per size
  quality: {
    400: 90, // Mobile - higher quality
    800: 85, // Tablet
    1200: 80, // Desktop
  },

  // Features
  enableWebP: true,
  enableAVIF: false, // Set to true if you want AVIF variants
  enablePlaceholders: false,
  enableCaching: true,
  skipUnchanged: true,

  // Additional directories to scan (beyond images, documents, fonts)
  // directories: ['footnotes', 'downloads'],

  // Custom processing rules
  rules: {
    '.jpg': { outputs: ['webp'], sizes: [400, 800, 1200] },
    '.jpeg': { outputs: ['webp'], sizes: [400, 800, 1200] },
    '.png': { outputs: ['webp'], sizes: [400, 800, 1200] },
    '.gif': { outputs: ['webp'], sizes: ['original'] },
    '.svg': { outputs: ['svg'], sizes: ['original'], optimize: true },
    '.webp': { outputs: ['webp'], sizes: [400, 800, 1200] },
    '.pdf': { outputs: ['pdf'], sizes: ['original'], generatePlaceholder: false },
    '.woff2': { outputs: ['woff2'], sizes: ['original'], generatePlaceholder: false },
    '.woff': { outputs: ['woff'], sizes: ['original'], generatePlaceholder: false },
    '.ttf': { outputs: ['ttf'], sizes: ['original'], generatePlaceholder: false },
  },

  // Hooks (optional)
  onError: ({ file, error }) => {
    console.error(`Error processing ${file}:`, error.message)
  },
}
