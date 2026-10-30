// ============================================================================
// Fotos del menú en el POS (30/10/2026)
// ============================================================================
// Son las mismas imágenes de Cloudinary del menú público. En /takeaway la
// miniatura compacta pide `w_200` con formato y calidad automáticos
// (apps/saas/lib/utils.ts → cloudinaryUrl); acá se pide igual, recortada
// cuadrada, para que pese poco y se vea idéntica. Otras URLs pasan tal cual.
// ============================================================================

export function menuThumbUrl(url: string | undefined | null, size = 200): string {
  if (!url) return ""
  if (!url.includes("res.cloudinary.com")) return url
  const parts = url.split("/upload/")
  if (parts.length !== 2) return url
  return `${parts[0]}/upload/f_auto,q_auto,w_${size},h_${size},c_fill/${parts[1]}`
}
