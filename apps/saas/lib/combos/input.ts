import mongoose from 'mongoose'

// ============================================================================
// Validación de lo que el panel manda al crear o editar un combo
// ============================================================================
// Lista blanca de campos: nada del body llega directo a la base.
// ============================================================================

export class ComboInputError extends Error {}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR = /^(#[0-9a-f]{3,8})?$/i
const MAX_POOL = 200
const MAX_TEXT = 120

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== 'string') throw new ComboInputError(`${field} debe ser texto`)
  const out = value.trim()
  if (out.length > max) throw new ComboInputError(`${field} no puede superar ${max} caracteres`)
  return out
}

function style(value: unknown) {
  if (value === null || typeof value !== 'object') throw new ComboInputError('Estilo inválido')
  const s = value as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of ['bgColor', 'textColor']) {
    if (s[key] === undefined) continue
    const color = text(s[key], key, 9)
    if (!COLOR.test(color)) throw new ComboInputError(`${key} debe ser un color hexadecimal`)
    out[key] = color
  }
  for (const key of ['badgeLabel', 'urgencyLabel']) {
    if (s[key] !== undefined) out[key] = text(s[key], key, 40)
  }
  if (s.imageUrl !== undefined) {
    const url = text(s.imageUrl, 'imageUrl', 500)
    if (url && !/^https:\/\//.test(url)) throw new ComboInputError('La imagen debe ser una URL https')
    out.imageUrl = url
  }
  return out
}

function schedule(value: unknown) {
  if (value === null) return null
  if (typeof value !== 'object') throw new ComboInputError('Horario inválido')
  const s = value as { days?: unknown; from?: unknown; to?: unknown }
  const days = s.days === undefined ? [] : s.days
  if (!Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new ComboInputError('Los días del horario son inválidos')
  }
  const from = s.from === undefined || s.from === '' ? '' : text(s.from, 'Desde', 5)
  const to = s.to === undefined || s.to === '' ? '' : text(s.to, 'Hasta', 5)
  if ((from && !HHMM.test(from)) || (to && !HHMM.test(to)) || Boolean(from) !== Boolean(to)) {
    throw new ComboInputError('El horario necesita desde y hasta en formato HH:mm')
  }
  if (days.length === 0 && !from) return null
  return { days, from, to }
}

/**
 * Devuelve solo los campos válidos presentes. `current` es el combo guardado al
 * editar: las reglas cruzadas (precio, cantidades) se validan contra el resultado.
 */
export function parseComboInput(body: unknown, current?: Record<string, any>): Record<string, unknown> {
  if (body === null || typeof body !== 'object') throw new ComboInputError('Datos inválidos')
  const b = body as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (b.name !== undefined || !current) {
    const name = text(b.name ?? '', 'El nombre')
    if (!name) throw new ComboInputError('El nombre del combo es obligatorio')
    out.name = name
  }
  if (b.description !== undefined) out.description = text(b.description, 'La descripción', 300)

  if (b.priceMode !== undefined) {
    if (b.priceMode !== 'fixed' && b.priceMode !== 'sumItems') throw new ComboInputError('Modo de precio inválido')
    out.priceMode = b.priceMode
  }
  const priceMode = (out.priceMode ?? current?.priceMode ?? 'fixed') as string
  out.priceMode = priceMode
  if (priceMode === 'fixed') {
    const price = b.fixedPrice ?? current?.fixedPrice
    if (!Number.isInteger(price) || (price as number) <= 0) {
      throw new ComboInputError('El precio fijo es obligatorio y va en centavos')
    }
    out.fixedPrice = price
  } else {
    out.fixedPrice = null
  }

  if (b.itemPool !== undefined || !current) {
    const pool = b.itemPool
    if (!Array.isArray(pool) || pool.length === 0) throw new ComboInputError('Elegí al menos un producto para el combo')
    if (pool.length > MAX_POOL) throw new ComboInputError(`Un combo admite hasta ${MAX_POOL} productos`)
    if (pool.some((id) => typeof id !== 'string' || !mongoose.isValidObjectId(id))) {
      throw new ComboInputError('Hay un producto inválido en el combo')
    }
    out.itemPool = [...new Set(pool as string[])]
  }

  for (const key of ['minItems', 'maxItems']) {
    if (b[key] === undefined) continue
    if (!Number.isInteger(b[key]) || (b[key] as number) < 1 || (b[key] as number) > 10) {
      throw new ComboInputError('La cantidad de platos va de 1 a 10')
    }
    out[key] = b[key]
  }
  const min = (out.minItems ?? current?.minItems ?? 2) as number
  const max = (out.maxItems ?? current?.maxItems ?? 2) as number
  if (min > max) throw new ComboInputError('El mínimo de platos no puede superar el máximo')

  const allowRepeat = b.allowRepeat ?? current?.allowRepeat ?? true
  const pool = (out.itemPool ?? current?.itemPool ?? []) as string[]
  if (!allowRepeat && pool.length < min) {
    throw new ComboInputError('Sin repetir platos, el combo necesita al menos tantos productos como platos')
  }

  for (const key of ['allowRepeat', 'chargeCustomizationExtras', 'isActive']) {
    if (b[key] === undefined) continue
    if (typeof b[key] !== 'boolean') throw new ComboInputError(`${key} debe ser verdadero o falso`)
    out[key] = b[key]
  }
  if (b.visibility !== undefined) {
    if (!['dine-in', 'takeaway', 'both'].includes(b.visibility as string)) throw new ComboInputError('Visibilidad inválida')
    out.visibility = b.visibility
  }
  if (b.sortOrder !== undefined) {
    if (!Number.isInteger(b.sortOrder)) throw new ComboInputError('Orden inválido')
    out.sortOrder = b.sortOrder
  }
  if (b.style !== undefined) out.style = style(b.style)
  if (b.availabilitySchedule !== undefined) out.availabilitySchedule = schedule(b.availabilitySchedule)
  return out
}
