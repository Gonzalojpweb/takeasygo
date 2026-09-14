const MAX_TAGS = 20
const MAX_TAG_LENGTH = 30

/**
 * Normaliza un tag: lowercase, sin acentos, trim, espacios → guiones.
 * "VIP" → "vip", "Mi Tag" → "mi-tag", "mi tag" → "mi-tag"
 */
export function normalizeTag(tag: string): string {
  if (!tag) return ''
  return tag
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
}

/**
 * Valida y normaliza un array de tags.
 * Lanza error si hay tags inválidos o exceso de cantidad/largo.
 */
export function validateAndNormalizeTags(tags: string[]): string[] {
  if (tags.length > MAX_TAGS) {
    throw new Error(`Too many tags: ${tags.length} (max ${MAX_TAGS})`)
  }

  const normalized = tags
    .map(normalizeTag)
    .filter(Boolean)

  const unique = Array.from(new Set(normalized))

  for (const tag of unique) {
    if (tag.length > MAX_TAG_LENGTH) {
      throw new Error(`Tag too long: "${tag}" (${tag.length} chars, max ${MAX_TAG_LENGTH})`)
    }
  }

  return unique
}
