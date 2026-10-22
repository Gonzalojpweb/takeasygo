import { notFound } from 'next/navigation'
import { loadInventoryPageContext } from '@/lib/inventory/page-context'
import { InventoryLocked, InventoryNoAccess } from '@/components/admin/inventory/InventoryGate'
import InventoryDashboard from '@/components/admin/inventory/InventoryDashboard'

// Pantalla clásica de Inventario, disponible durante la transición a V3.
// Se retira cuando V3 tenga paridad funcional validada en el piloto.
export default async function InventarioClasicoPage() {
  const ctx = await loadInventoryPageContext()
  if (ctx.kind === 'not_found') notFound()
  if (ctx.kind === 'locked') return <InventoryLocked tenantSlug={ctx.tenantSlug} plan={ctx.plan} />
  if (ctx.kind === 'no_access') return <InventoryNoAccess />
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
