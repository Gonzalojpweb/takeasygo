import { notFound } from 'next/navigation'
import { loadInventoryPageContext } from '@/lib/inventory/page-context'
import { InventoryLocked, InventoryNoAccess } from '@/components/admin/inventory/InventoryGate'
import InventoryV3 from '@/components/admin/inventory-v3/InventoryV3'

// ============================================================================
// Inventario — Pantalla V3 (moderna)
// ============================================================================
// Ruta directa a la versión V3 para cualquier tenant, con guías paso a paso,
// contextos (Ahora, Productos, Recetas, Compras, Envíos, Actividad).
// ============================================================================

export default async function InventarioV3Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await loadInventoryPageContext()
  if (ctx.kind === 'not_found') notFound()
  if (ctx.kind === 'locked') return <InventoryLocked tenantSlug={ctx.tenantSlug} plan={ctx.plan} />
  if (ctx.kind === 'no_access') return <InventoryNoAccess />

  const sp = await searchParams
  const pick = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)

  return (
    <InventoryV3
      tenantSlug={ctx.tenantSlug}
      capabilities={ctx.capabilities}
      locations={ctx.locations}
      initialView={pick('vista')}
      initialLocationId={pick('sede')}
    />
  )
}
