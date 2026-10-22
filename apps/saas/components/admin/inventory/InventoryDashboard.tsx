'use client'

// ============================================================================
// InventoryDashboard — TGO Inventory v2 en el admin
// ============================================================================
// Pestañas por capacidad del rol (las APIs vuelven a validar todo):
//   Hoy · Recepción · Stock  → capture/read (admin, manager, gerente de
//                                            operaciones, jefe de cocina)
//   Recetas                  → recipes      (los mismos)
//   Configuración            → manage       (admin, manager, gerente de
//                                            operaciones)
// Cajero, staff y mozo no tienen inventario (lib/inventory/route.ts).
// ============================================================================

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import TodayTab from './TodayTab'
import StockTab from './StockTab'
import ReceiptTab from './ReceiptTab'
import RecipesTab from './RecipesTab'
import SetupTab from './SetupTab'
import { fieldClass, inventoryApi, useAsyncData, type SkuOption, type StorageOption } from './shared'

interface LocationOption {
  id: string
  name: string
  inventoryActive: boolean
}

interface Props {
  tenantSlug: string
  canRead: boolean
  canRecipes: boolean
  canManage: boolean
  locations: LocationOption[]
}

export default function InventoryDashboard({ tenantSlug, canRead, canRecipes, canManage, locations: initialLocations }: Props) {
  const [locationId, setLocationId] = useState(initialLocations.find((l) => l.inventoryActive)?.id ?? initialLocations[0]?.id ?? '')

  // Catálogo compartido por las pestañas; `stamp` remonta Hoy/Stock al recargar.
  const catalog = useAsyncData(async () => {
    const [s, st, setup] = await Promise.all([
      inventoryApi<{ skus: SkuOption[] }>(tenantSlug, canManage ? 'skus?all=1' : 'skus', { silent: true }),
      inventoryApi<{ storages: StorageOption[] }>(tenantSlug, 'storage-locations', { silent: true }),
      canRead ? inventoryApi<{ locations: LocationOption[] }>(tenantSlug, 'setup', { silent: true }) : Promise.resolve(null),
    ])
    return { skus: s?.skus ?? [], storages: st?.storages ?? [], locations: setup?.locations ?? null, stamp: Date.now() }
  }, `${tenantSlug}|${canManage}|${canRead}`)
  const skus = catalog.data?.skus ?? []
  const storages = catalog.data?.storages ?? []
  const locations = catalog.data?.locations ?? initialLocations
  const version = catalog.data?.stamp ?? 0
  const loadCatalog = catalog.reload
  const location = locations.find((l) => l.id === locationId)

  if (!location) {
    return <p className="py-24 text-center text-muted-foreground">No hay sedes disponibles.</p>
  }

  const locationStorages = storages.filter((s) => s.locationId === locationId)

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Inventario</h1>
          <p className="mt-2 font-medium text-muted-foreground">
            Las ventas descuentan insumos solas. Vos verificás solo lo que importa.
          </p>
        </div>
        {locations.length > 1 && (
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${fieldClass} w-56`} aria-label="Sede">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}{l.inventoryActive ? '' : ' (inactivo)'}
              </option>
            ))}
          </select>
        )}
      </div>

      {!location.inventoryActive && !canManage && (
        <p className="rounded-2xl bg-amber-500/10 p-4 text-sm font-medium text-amber-800">
          El inventario todavía no está activo en esta sede. Pedile al encargado que lo active.
        </p>
      )}

      <Tabs defaultValue={location.inventoryActive || !canManage ? 'today' : 'setup'} key={`${locationId}|${location.inventoryActive}`}>
        <TabsList>
          <TabsTrigger value="today">Hoy</TabsTrigger>
          {canRead && <TabsTrigger value="stock">Stock</TabsTrigger>}
          <TabsTrigger value="receipt">Recepción</TabsTrigger>
          {canRecipes && <TabsTrigger value="recipes">Recetas</TabsTrigger>}
          {canManage && <TabsTrigger value="setup">Configuración</TabsTrigger>}
        </TabsList>

        <TabsContent value="today" className="mt-6">
          <TodayTab key={version} tenantSlug={tenantSlug} locationId={locationId} showValues={canRead} />
        </TabsContent>
        {canRead && (
          <TabsContent value="stock" className="mt-6">
            <StockTab key={version} tenantSlug={tenantSlug} locationId={locationId} />
          </TabsContent>
        )}
        <TabsContent value="receipt" className="mt-6">
          <ReceiptTab tenantSlug={tenantSlug} skus={skus} storages={locationStorages} onDone={loadCatalog} />
        </TabsContent>
        {canRecipes && (
          <TabsContent value="recipes" className="mt-6">
            <RecipesTab tenantSlug={tenantSlug} locationId={locationId} skus={skus} onCatalogChange={loadCatalog} />
          </TabsContent>
        )}
        {canManage && (
          <TabsContent value="setup" className="mt-6">
            <SetupTab tenantSlug={tenantSlug} location={location} skus={skus} storages={storages} onChange={loadCatalog} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
