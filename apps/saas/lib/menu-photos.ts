/**
 * lib/menu-photos.ts
 * `onboarding.menuPhotos` guarda tanto imágenes como PDFs de carta.
 * Los PDF se suben con `resource_type: 'raw'` de Cloudinary, así que hay que
 * poder distinguirlos a la hora de renderizar (un <img> no puede mostrarlos).
 */
export function isPdfUrl(url: string): boolean {
  if (!url) return false
  return /\.pdf(\?|#|$)/i.test(url) || url.includes('/raw/upload/')
}
