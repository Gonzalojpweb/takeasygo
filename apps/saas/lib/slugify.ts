/**
 * lib/slugify.ts
 *
 * Normaliza CUALQUIER texto a un slug válido para URL.
 * Acepta cualquier alfabeto con/sin tilde, mayúsculas, símbolos, espacios,
 * emoji y textos sin caracteres ASCII: siempre devuelve algo usable en
 * /tenant/slug o /sede/slug, nunca vacío.
 *
 * El slug sigue restringido a [a-z0-9-] porque va dentro de la URL, pero la
 * restricción la aplica ESTA función: el usuario puede escribir lo que quiera.
 */

export function slugify(input: string | null | undefined): string {
  if (!input) return ''

  return String(input)
    .normalize('NFD') // descompone ñ → n + ̃ , á → a + ´
    .replace(/[\u0300-\u036f]/g, '') // quita los diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // cualquier resto (símbolos, espacios, no-ASCII) → guion
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
}

/**
 * Slug final garantizado no vacío y dentro del máximo de 50.
 * Orden: lo que escribió el usuario → el nombre del negocio → fallback aleatorio.
 */
export function slugifyOrFallback(
  name: string | null | undefined,
  preferred?: string | null
): string {
  const candidate =
    slugify(preferred) ||
    slugify(name) ||
    `local-${Math.random().toString(36).slice(2, 8)}`

  // Mínimo 2 caracteres: es el contrato mínimo que ya manejaba el register.
  return candidate.length < 2 ? `${candidate}-1` : candidate
}
