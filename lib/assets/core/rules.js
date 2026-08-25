/**
 * Asset Processing Rules Configuration
 * Defines how different file types should be processed
 */

export const PROCESSING_RULES = {
  '.jpg': {
    outputs: ['webp', 'avif'],
    sizes: [400, 800, 1200],
    generatePlaceholder: true,
  },
  '.jpeg': {
    outputs: ['webp', 'avif'],
    sizes: [400, 800, 1200],
    generatePlaceholder: true,
  },
  '.png': {
    outputs: ['webp', 'avif'],
    sizes: [400, 800, 1200],
    generatePlaceholder: true,
  },
  '.gif': {
    outputs: ['webp'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.svg': {
    outputs: ['svg'],
    sizes: ['original'],
    optimize: true,
    generatePlaceholder: false,
  },
  '.pdf': {
    outputs: ['pdf'],
    sizes: ['original'],
    compress: true,
    generatePlaceholder: false,
  },
  '.doc': {
    outputs: ['doc'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.docx': {
    outputs: ['docx'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.txt': {
    outputs: ['txt'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.rtf': {
    outputs: ['rtf'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.xls': {
    outputs: ['xls'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.xlsx': {
    outputs: ['xlsx'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.ppt': {
    outputs: ['ppt'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.pptx': {
    outputs: ['pptx'],
    sizes: ['original'],
    generatePlaceholder: false,
  },
  '.webp': {
    outputs: ['webp'],
    sizes: [400, 800, 1200],
    generatePlaceholder: false,
  },
  '.avif': {
    outputs: ['avif'],
    sizes: [400, 800, 1200],
    generatePlaceholder: false,
  },
}

export const PLACEHOLDER_CONFIG = {
  width: 20, // Very small width for base64
  quality: 60, // Lower quality for smaller size
  blur: 0.3, // Blur amount (will be applied via CSS)
}

export const DEFAULT_CONFIG = {
  sourcePath: 'public',
  manifestPath: 'public/assets-manifest.json',
  enablePlaceholders: true,
  quality: {
    webp: { 400: 90, 800: 85, 1200: 80, original: 80 },
    avif: { 400: 75, 800: 65, 1200: 55, original: 55 },
  },
  skipUnchanged: true,
}
