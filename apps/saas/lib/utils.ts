import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const _nf = new Intl.NumberFormat('es-AR')
export function fmt(n: number): string {
  return _nf.format(n)
}

/**
 * Optimize a Cloudinary image URL with transformations.
 * Appends f_auto (WebP/AVIF), q_auto (smart quality), and optional width.
 * Non-Cloudinary URLs are returned as-is.
 */
export function cloudinaryUrl(
  url: string | undefined | null,
  opts?: { w?: number; h?: number; blur?: number },
): string {
  if (!url || !url.includes('res.cloudinary.com')) return url || ''

  const parts = url.split('/upload/')
  if (parts.length !== 2) return url

  const transformations: string[] = ['f_auto', 'q_auto']
  if (opts?.w) transformations.push(`w_${opts.w}`)
  if (opts?.h) transformations.push(`h_${opts.h}`, 'c_fill')
  if (opts?.blur) transformations.push(`e_blur:${opts.blur}`)

  return `${parts[0]}/upload/${transformations.join(',')}/${parts[1]}`
}

/**
 * Generate a tiny base64 blur placeholder for a Cloudinary image.
 * Returns a 20px wide blurred version for progressive loading.
 */
export function cloudinaryBlurUrl(url: string | undefined | null): string {
  return cloudinaryUrl(url, { w: 20, blur: 200 })
}
