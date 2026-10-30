import { notFound } from 'next/navigation'
import { loadInventoryPageContext } from '@/lib/inventory/page-context'
import { InventoryLocked, InventoryNoAccess } from '@/components/admin/inventory/InventoryGate'
import InventoryImport from '@/components/admin/inventory-import/InventoryImport'

// ============================================================================
// Inventario › Importar desde otro sistema (importador v1, 30/10/2026)
// ============================================================================
// Mismo control de acceso que Inventario (plan + rol); importar exige
// `manage` (admin, manager, gerente de operaciones), igual que la API.
// ============================================================================

export default async function ImportarInventarioPage() {
  const ctx = await loadInventoryPageContext()
  if (ctx.kind === 'not_found') notFound()
  if (ctx.kind === 'locked') return <InventoryLocked tenantSlug={ctx.tenantSlug} plan={ctx.plan} />
  if (ctx.kind === 'no_access' || !ctx.capabilities.manage) return <InventoryNoAccess />
  return <InventoryImport tenantSlug={ctx.tenantSlug} locations={ctx.locations} backHref={`/${ctx.tenantSlug}/admin/inventario`} />
}
