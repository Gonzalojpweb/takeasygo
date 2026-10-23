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
import { CircleHelp, ClipboardList, PackageOpen, Settings2, Truck, UtensilsCrossed, Zap } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { invApi } from './data/api'
import { useResource } from './data/useResource'
import type { Capabilities, LocationOption, SetupStatus, SkuOption, StorageOption } from './data/types'
import { btnPrimary, btnSecondary } from './ui'
import HelpCenter from './HelpCenter'
import { HELP_BY_VIEW, type HelpTopicId } from '@/lib/inventory/ui/help-content'
import { cn } from '@/lib/utils'
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

const STATUS_PILL: Record<SetupStatus, { dot: string; cls: string; label: string; title: string }> = {
  active: { dot: 'bg-emerald-500', cls: 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200', label: 'Inventario activo', title: 'Las ventas descuentan insumos solas' },
  preparing: { dot: 'bg-amber-500', cls: 'border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100', label: 'En preparación', title: 'Las ventas todavía no descuentan' },
  off: { dot: 'bg-slate-400', cls: 'border-border bg-muted text-foreground', label: 'Sin inventario', title: 'Esta sede todavía no tiene inventario' },
}

export interface V3Context {
  tenantSlug: string
  caps: Capabilities
  location: LocationOption
  /** Insumos activos (los que se pueden usar). */
  skus: SkuOption[]
  /** Incluye desactivados (solo con manage). */
  allSkus: SkuOption[]
  storages: StorageOption[]
  /** Depósitos activos de TODAS las sedes del alcance (transferencias). */
  allStorages: StorageOption[]
  /** Sedes del alcance (nombres para transferencias). */
  locations: LocationOption[]
  /** El catálogo (insumos y depósitos) ya llegó al menos una vez. */
  catalogReady: boolean
  /** Cambia cuando algo se registró: las vistas recargan. */
  version: number
  open: (p: PanelRequest) => void
  goTo: (view: ViewId) => void
  /** Abre el centro de ayuda (en un tema, o en el de la pantalla actual). */
  help: (topic?: HelpTopicId) => void
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
  // Centro de ayuda: cada apertura remonta el panel en el tema pedido.
  const [help, setHelp] = useState<{ topic: HelpTopicId | null; n: number } | null>(null)
  const openHelp = useCallback((topic?: HelpTopicId) => setHelp((h) => ({ topic: topic ?? null, n: (h?.n ?? 0) + 1 })), [])

  // URL ← contexto y sede (sin recargar ni ensuciar el historial).
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('vista', view)
    if (locationId) url.searchParams.set('sede', locationId)
    window.history.replaceState(null, '', url)
  }, [view, locationId])

  const catalog = useResource(`${tenantSlug}|catalog`, async (signal) => {
    const [skus, storages] = await Promise.all([
      // Gestión ve también los insumos desactivados (para reactivarlos).
      invApi<{ skus: SkuOption[] }>(tenantSlug, capabilities.manage ? 'skus?all=1' : 'skus', { signal }),
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
            skus: (catalog.data?.skus ?? []).filter((s) => s.isActive),
            allSkus: catalog.data?.skus ?? [],
            storages: (catalog.data?.storages ?? []).filter((s) => s.locationId === location.id && s.isActive),
            allStorages: (catalog.data?.storages ?? []).filter((s) => s.isActive),
            locations,
            catalogReady: catalog.data !== null,
            version,
            open: setPanel,
            goTo: setView,
            help: openHelp,
            refreshCatalog: catalog.reload,
            refreshStatus,
          }
        : null,
    [location, locations, tenantSlug, capabilities, catalog.data, catalog.reload, version, refreshStatus, openHelp],
  )

  if (!ctx || !location) {
    return <p className="py-24 text-center text-muted-foreground">No hay sedes disponibles para tu usuario.</p>
  }

  const pill = STATUS_PILL[location.status]

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Inventario</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Control automático de tu mercadería</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span title={pill.title} className={cn('inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-bold', pill.cls)}>
            <span aria-hidden className={cn('size-2.5 rounded-full', pill.dot)} />
            {pill.label}
            <span className="sr-only">: {pill.title}</span>
          </span>
          <button type="button" className={btnSecondary} onClick={() => openHelp(HELP_BY_VIEW[view])}>
            <CircleHelp size={18} aria-hidden /> Ver ayuda
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-end gap-2">
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
          {capabilities.manage && location.status !== 'off' && (
            <button type="button" className={btnSecondary} onClick={() => setPanel({ type: 'location-settings' })}>
              <Settings2 size={18} aria-hidden /> Configuración de la sede
            </button>
          )}
          {capabilities.capture && location.status !== 'off' && (
            <button type="button" className={btnPrimary} onClick={() => setPanel({ type: 'receive' })}>
              <Truck size={18} aria-hidden /> Registrar mercadería
            </button>
          )}
      </div>

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

      {help && <HelpCenter key={help.n} ctx={ctx} open topic={help.topic} onClose={() => setHelp(null)} />}

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
