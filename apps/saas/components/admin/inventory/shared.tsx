'use client'

// ============================================================================
// Inventario — utilitarios compartidos de la UI
// ============================================================================
// Lenguaje operacional, no estadístico (FASE04 §11): nunca "σ = 2,1", sino
// "≈ 12 kg (± 1,5)" y "Requiere verificación".
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'unit'
export const UNITS: Unit[] = ['kg', 'g', 'l', 'ml', 'unit']
export const UNIT_LABEL: Record<string, string> = { kg: 'kg', g: 'g', l: 'l', ml: 'ml', unit: 'u.' }

/** Unidades de carga compatibles con la unidad del insumo. */
export function compatibleUnits(canonical: string): Unit[] {
  if (canonical === 'kg' || canonical === 'g') return ['kg', 'g']
  if (canonical === 'l' || canonical === 'ml') return ['l', 'ml']
  return ['unit']
}

export const CATEGORY_LABEL: Record<string, string> = {
  meat_poultry: 'Carnes y aves',
  fish_seafood: 'Pescados',
  vegetables: 'Verduras',
  fruits: 'Frutas',
  dairy: 'Lácteos',
  dry_goods: 'Almacén',
  beverages: 'Bebidas',
  packaging: 'Descartables',
  other: 'Otros',
}

export const IMPACT_LABEL: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo' }

export const METHOD_LABEL: Record<string, string> = {
  connected_scale: 'Balanza conectada',
  manual_scale: 'Balanza',
  visual_count: 'Conteo a ojo',
  estimation: 'Estimación',
}

export const WASTE_REASON_LABEL: Record<string, string> = {
  expiration: 'Vencimiento',
  damage: 'Rotura / daño',
  preparation: 'Preparación',
  contamination: 'Contaminación',
  staff_meal: 'Comida del personal',
  other: 'Otro',
}

export const EVENT_LABEL: Record<string, string> = {
  GoodsReceived: 'Recepción',
  WasteRecorded: 'Merma',
  PhysicalCountObserved: 'Conteo',
  AdjustmentApplied: 'Ajuste',
  TransferOut: 'Transferencia (salida)',
  TransferIn: 'Transferencia (entrada)',
  ProductionTransformed: 'Producción',
  SaleRecorded: 'Venta',
  SaleConsumed: 'Venta (v1)',
}

export function pesos(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('es-AR')}`
}

export function qty(value: number, unit: string, decimals = 2): string {
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: decimals }).format(value)} ${UNIT_LABEL[unit] ?? unit}`
}

/** "≈ 12,5 kg ± 1,2" — la estimación nunca se muestra como verdad exacta. */
export function estimate(mu: number, sigma: number, unit: string): string {
  const s = sigma >= 0.005 ? ` ± ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(sigma)}` : ''
  return `≈ ${qty(mu, unit)}${s}`
}

export function newClientEventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** fetch a la API de inventario con manejo de error uniforme (toast). */
export async function inventoryApi<T = unknown>(
  tenantSlug: string,
  path: string,
  init?: { method?: string; body?: unknown; silent?: boolean },
): Promise<T | null> {
  try {
    const res = await fetch(`/api/${tenantSlug}/inventory/${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (!init?.silent) toast.error(data?.error ?? 'No se pudo completar la acción')
      return null
    }
    return data as T
  } catch {
    if (!init?.silent) toast.error('Sin conexión con el servidor')
    return null
  }
}

const CONFIDENCE: Record<string, { label: string; className: string }> = {
  high: { label: 'Confiable', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
  medium: { label: 'Atención', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  low: { label: 'Requiere verificación', className: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
  critical: { label: 'Alta incertidumbre', className: 'bg-red-500/10 text-red-700 border-red-500/20' },
  unknown: { label: 'Sin conteo inicial', className: 'bg-muted text-muted-foreground border-border' },
}

export function ConfidenceBadge({ level }: { level: string }) {
  const c = CONFIDENCE[level] ?? CONFIDENCE.unknown
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${c.className}`}>{c.label}</span>
}

export function SectionCard({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black tracking-tight">{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border/60 bg-muted/10 py-10 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="max-w-md text-sm font-medium text-muted-foreground">{text}</p>
    </div>
  )
}

export const fieldClass =
  'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
export const buttonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50'
export const ghostButtonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50'

export interface SkuOption {
  _id: string
  name: string
  canonicalUnit: string
  category: string
  kind: string
  businessImpact: string
  lastUnitCostCents: number
  parLevel: number | null
  supplierName: string | null
  isActive: boolean
}

export interface StorageOption {
  _id: string
  name: string
  locationId: string
  isDefaultConsumption: boolean
  isActive: boolean
}

/**
 * Carga asíncrona atada a una clave: vuelve a cargar cuando cambia `key` o
 * cuando se llama `reload()`. El estado se actualiza en el callback de la
 * promesa (no dentro del efecto) y se descarta si la clave cambió.
 */
export function useAsyncData<T>(loader: () => Promise<T>, key: string) {
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<{ data: T | null; loadedKey: string | null }>({ data: null, loadedKey: null })
  const currentKey = `${key}#${nonce}`

  useEffect(() => {
    let cancelled = false
    loaderRef.current().then((data) => {
      if (!cancelled) setState({ data, loadedKey: currentKey })
    })
    return () => {
      cancelled = true
    }
  }, [currentKey])

  return {
    data: state.data,
    loading: state.loadedKey !== currentKey,
    reload: () => setNonce((n) => n + 1),
  }
}
