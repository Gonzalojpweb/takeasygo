'use client'

// ============================================================================
// Inventario V3 — contenedor
// ============================================================================
// Cuatro contextos (no pestañas por entidad): Ahora · Productos · Recetas ·
// Actividad. Las acciones (recibir, contar, merma, receta, detalle) se abren
// en UN panel lateral (pantalla completa en el celular): nada se despliega
// dentro de las listas. La URL guarda contexto y sede (?vista=&sede=) para
// que "volver" y compartir un link funcionen.
//
// Capas: data/ (API y estados) · lib/inventory/ui (lógica pura) · views/ y
// panels/ (presentación). Las reglas de inventario viven en el servidor.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, PackageOpen, Truck, UtensilsCrossed, Zap } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { invApi } from './data/api'
import { useResource } from './data/useResource'
import type { Capabilities, LocationOption, SetupStatus, SkuOption, StorageOption } from './data/types'
import { StatusTag, btnPrimary } from './ui'
import NowView from './views/NowView'
import ProductsView from './views/ProductsView'
import RecipesView from './views/RecipesView'
import ActivityView from './views/ActivityView'
import PanelHost, { type PanelRequest } from './panels/PanelHost'

export type ViewId = 'ahora' | 'productos' | 'recetas' | 'actividad'

const VIEWS: Array<{ id: ViewId; label: string; icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; needs?: keyof Capabilities }> = [
  { id: 'ahora', label: 'Ahora', icon: Zap },
  { id: 'productos', label: 'Productos', icon: PackageOpen, needs: 'read' },
  { id: 'recetas', label: 'Recetas', icon: UtensilsCrossed, needs: 'recipes' },
  { id: 'actividad', label: 'Actividad', icon: ClipboardList, needs: 'read' },
]

const STATUS_TAG: Record<SetupStatus, { tone: 'ok' | 'warning' | 'neutral'; label: string }> = {
  active: { tone: 'ok', label: 'Activo: las ventas descuentan' },
  preparing: { tone: 'warning', label: 'En preparación: las ventas todavía no descuentan' },
  off: { tone: 'neutral', label: 'Sin inventario' },
}

export interface V3Context {
  tenantSlug: string
  caps: Capabilities
  location: LocationOption
  skus: SkuOption[]
  storages: StorageOption[]
  /** El catálogo (insumos y depósitos) ya llegó al menos una vez. */
  catalogReady: boolean
  /** Cambia cuando algo se registró: las vistas recargan. */
  version: number
  open: (p: PanelRequest) => void
  goTo: (view: ViewId) => void
  refreshCatalog: () => void
  refreshStatus: () => Promise<void>
}

export default function InventoryV3({
  tenantSlug,
  capabilities,
  locations: initialLocations,
  initialView,
  initialLocationId,
}: {
  tenantSlug: string
  capabilities: Capabilities
  locations: LocationOption[]
  initialView: string | null
  initialLocationId: string | null
}) {
  const allowed = VIEWS.filter((v) => !v.needs || capabilities[v.needs])
  const [locations, setLocations] = useState(initialLocations)
  const [locationId, setLocationId] = useState(
    () =>
      locations.find((l) => l.id === initialLocationId)?.id ??
      locations.find((l) => l.status === 'active')?.id ??
      locations.find((l) => l.status === 'preparing')?.id ??
      locations[0]?.id ??
      '',
  )
  const [view, setView] = useState<ViewId>(() => (allowed.some((v) => v.id === initialView) ? (initialView as ViewId) : 'ahora'))
  const [panel, setPanel] = useState<PanelRequest | null>(null)
  const [version, setVersion] = useState(0)

  // URL ← contexto y sede (sin recargar ni ensuciar el historial).
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('vista', view)
    if (locationId) url.searchParams.set('sede', locationId)
    window.history.replaceState(null, '', url)
  }, [view, locationId])

  const catalog = useResource(`${tenantSlug}|catalog`, async (signal) => {
    const [skus, storages] = await Promise.all([
      invApi<{ skus: SkuOption[] }>(tenantSlug, 'skus', { signal }),
      invApi<{ storages: StorageOption[] }>(tenantSlug, 'storage-locations', { signal }),
    ])
    if (!skus.ok) return skus
    if (!storages.ok) return storages
    return { ok: true as const, data: { skus: skus.data.skus, storages: storages.data.storages } }
  })

  const refreshStatus = useCallback(async () => {
    if (!capabilities.read) return
    const res = await invApi<{ locations: LocationOption[] }>(tenantSlug, 'setup')
    if (res.ok) setLocations(res.data.locations)
  }, [tenantSlug, capabilities.read])

  const location = locations.find((l) => l.id === locationId)
  const ctx: V3Context | null = useMemo(
    () =>
      location
        ? {
            tenantSlug,
            caps: capabilities,
            location,
            skus: catalog.data?.skus ?? [],
            storages: (catalog.data?.storages ?? []).filter((s) => s.locationId === location.id && s.isActive),
            catalogReady: catalog.data !== null,
            version,
            open: setPanel,
            goTo: setView,
            refreshCatalog: catalog.reload,
            refreshStatus,
          }
        : null,
    [location, tenantSlug, capabilities, catalog.data, catalog.reload, version, refreshStatus],
  )

  if (!ctx || !location) {
    return <p className="py-24 text-center text-muted-foreground">No hay sedes disponibles para tu usuario.</p>
  }

  const tag = STATUS_TAG[location.status]

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Inventario</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">El restaurante trabaja; TakeasyGO controla y acompaña.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusTag tone={tag.tone}>{tag.label}</StatusTag>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          {locations.length > 1 && (
            <label className="flex flex-1 flex-col gap-1 text-sm font-bold sm:flex-none">
              Sede
              <select
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value)
                  setPanel(null)
                }}
                className="min-h-11 rounded-xl border-2 border-border bg-background px-3 text-base sm:w-56"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.status === 'active' ? '' : l.status === 'preparing' ? ' (en preparación)' : ' (sin inventario)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {capabilities.capture && location.status !== 'off' && (
            <button type="button" className={btnPrimary} onClick={() => setPanel({ type: 'receive' })}>
              <Truck size={18} aria-hidden /> Recibir mercadería
            </button>
          )}
        </div>
      </header>

      <Tabs value={view} onValueChange={(v) => setView(v as ViewId)} className="gap-5">
        <TabsList aria-label="Contextos de inventario" className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-muted p-1 sm:w-fit">
          {allowed.map((v) => (
            <TabsTrigger key={v.id} value={v.id} className="min-h-11 gap-2 rounded-xl px-4 text-sm font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <v.icon size={18} aria-hidden /> {v.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ahora">
          <NowView ctx={ctx} />
        </TabsContent>
        {capabilities.read && (
          <TabsContent value="productos">
            <ProductsView ctx={ctx} />
          </TabsContent>
        )}
        {capabilities.recipes && (
          <TabsContent value="recetas">
            <RecipesView ctx={ctx} />
          </TabsContent>
        )}
        {capabilities.read && (
          <TabsContent value="actividad">
            <ActivityView ctx={ctx} />
          </TabsContent>
        )}
      </Tabs>

      <p className="text-xs text-muted-foreground">
        ¿Necesitás algo que todavía no está acá?{' '}
        <Link href={`/${tenantSlug}/admin/inventario/clasico`} className="font-bold underline underline-offset-2">
          Abrir la pantalla clásica
        </Link>
      </p>

      <PanelHost
        ctx={ctx}
        request={panel}
        onClose={() => setPanel(null)}
        onSwitch={setPanel}
        onChanged={() => {
          setVersion((v) => v + 1)
          catalog.reload()
        }}
      />
    </div>
  )
}
