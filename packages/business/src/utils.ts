/**
 * Normaliza un texto para búsqueda: lowercase, sin acentos, sin espacios dobles.
 * Usado para nameSearchToken — hash de búsqueda, no dato sensible.
 */
export function normalizeForSearch(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}
