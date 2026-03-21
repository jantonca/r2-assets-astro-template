// R2 Image Configuration
// Update these values for your project

export const r2Config = {
  // R2 CDN domain (your custom domain or workers.dev URL)
  domain: 'https://cdn.yourproject.com',

  // Image path prefix in R2 bucket
  imagePath: 'images',

  // Responsive breakpoints (should match assets.config.js)
  widths: [400, 800, 1200],

  // Default image format
  defaultFormat: 'webp',

  // CSS classes for aspect ratio containers
  aspectRatioClass: 'w-full h-full object-cover',
}

export default r2Config
