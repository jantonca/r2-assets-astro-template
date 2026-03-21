export interface R2Config {
  r2Domain: string
  imagePath: string
  widths: number[]
  defaultFormat: string
  fallbackToR2: boolean
}

export const DEFAULT_R2_CONFIG: R2Config = {
  r2Domain: 'https://cdn.yourproject.com', // Change to your CDN domain
  imagePath: 'images',
  widths: [400, 800, 1200],
  defaultFormat: 'webp',
  fallbackToR2: true,
}

/** Generate a srcset string for R2-hosted responsive images */
export function generateR2Srcset(
  src: string,
  format: string,
  config: Pick<R2Config, 'r2Domain' | 'imagePath' | 'widths'>
): string | undefined {
  if (!src || src.endsWith('.svg')) return undefined

  const nameWithoutExt = src.replace(/\.[^.]+$/, '')

  return config.widths
    .map(
      (width) =>
        `${config.r2Domain}/${config.imagePath}/${nameWithoutExt}-${width}.${format} ${width}w`
    )
    .join(', ')
}
