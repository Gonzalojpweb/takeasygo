import { notFound } from 'next/navigation'
import { loadInventoryPageContext } from '@/lib/inventory/page-context'
import { InventoryLocked, InventoryNoAccess } from '@/components/admin/inventory/InventoryGate'
import InventoryDashboard from '@/components/admin/inventory/InventoryDashboard'
import InventoryV3 from '@/components/admin/inventory-v3/InventoryV3'

// ============================================================================
// Inventario — V3 (flag por tenant `inventory.v3`) o la pantalla clásica
// ============================================================================
// Server component: plan (Lock + CTA), capacidades del rol y sedes con su
// estado. Con V3 encendido, la clásica sigue en /admin/inventario/clasico
// hasta validar paridad funcional.
// ============================================================================

export default async function InventarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await loadInventoryPageContext()
  if (ctx.kind === 'not_found') notFound()
  if (ctx.kind === 'locked') return <InventoryLocked tenantSlug={ctx.tenantSlug} plan={ctx.plan} />
  if (ctx.kind === 'no_access') return <InventoryNoAccess />

  if (ctx.v3) {
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

  return (
    <InventoryDashboard
      tenantSlug={ctx.tenantSlug}
      canRead={ctx.capabilities.read}
      canRecipes={ctx.capabilities.recipes}
      canManage={ctx.capabilities.manage}
      locations={ctx.locations}
    />
  )
}
