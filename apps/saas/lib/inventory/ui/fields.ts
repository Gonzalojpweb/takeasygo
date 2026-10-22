// ============================================================================
// Inventario V3 — lectura y validación de campos (puro)
// ============================================================================
// Los errores se devuelven por campo, para mostrarlos JUNTO al campo (no en
// un toast). Lo cargado nunca se descarta por un error.
// ============================================================================

/** "1,5" · "1.5" · " 2 " → número; "" o texto → null. Acepta separador de miles "1.250,5". */
export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '')
  if (!t) return null
  let normalized = t
  if (t.includes(',') && t.includes('.')) normalized = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',')) normalized = t.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Pesos escritos por una persona ("54.000", "54000,50") → centavos. */
export function parsePesosToCents(raw: string): number | null {
  const t = raw.trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!t) return null
  const n = parseDecimal(t.includes(',') ? t : t.replace(/\.(?=\d{3}(\D|$))/g, ''))
  return n === null || n < 0 ? null : Math.round(n * 100)
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>

export function hasErrors<K extends string>(e: FieldErrors<K>): boolean {
  return Object.values(e).some(Boolean)
}

/** Unidades en las que se puede cargar un insumo (misma dimensión que la suya). */
export function compatibleUnits(canonical: string): Array<'kg' | 'g' | 'l' | 'ml' | 'unit'> {
  if (canonical === 'kg' || canonical === 'g') return ['kg', 'g']
  if (canonical === 'l' || canonical === 'ml') return ['l', 'ml']
  return ['unit']
}

/** Unidad cómoda para una receta (por porción se piensa en g/ml, no kg/l). */
export function recipeDefaultUnit(canonical: string): 'kg' | 'g' | 'l' | 'ml' | 'unit' {
  if (canonical === 'kg') return 'g'
  if (canonical === 'l') return 'ml'
  return canonical as 'g' | 'ml' | 'unit'
}

/** Id para idempotencia de cada envío (el servidor no duplica un reintento). */
export function newClientEventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
