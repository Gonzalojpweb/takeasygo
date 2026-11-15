import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { loadInventoryPageContext } from '@/lib/inventory/page-context'
import { InventoryLocked, InventoryNoAccess } from '@/components/admin/inventory/InventoryGate'
import InventoryDashboard from '@/components/admin/inventory/InventoryDashboard'
import InventoryV3 from '@/components/admin/inventory-v3/InventoryV3'

// ============================================================================
// Inventario — V3 (moderna) o pantalla clásica
// ============================================================================
// Precedencia para elegir la pantalla:
//   1. Query param de URL: ?version=v3 / ?version=clasico (o ?v=3 / ?v=clasico)
//   2. Cookie del usuario: inventory_version ('v3' | 'clasico')
//   3. Feature flag del tenant en base de datos: ctx.v3 (FLAGS.INVENTORY_V3)
// ============================================================================

export default async function InventarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await loadInventoryPageContext()
  if (ctx.kind === 'not_found') notFound()
  if (ctx.kind === 'locked') return <InventoryLocked tenantSlug={ctx.tenantSlug} plan={ctx.plan} />
  if (ctx.kind === 'no_access') return <InventoryNoAccess />

  const sp = await searchParams
  const pick = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const versionParam = pick('version')?.toLowerCase() ?? pick('v')?.toLowerCase()

  const cookieStore = await cookies()
  const cookieVersion = cookieStore.get('inventory_version')?.value

  const isV3 =
    versionParam === 'v3' || versionParam === '3'
      ? true
      : versionParam === 'clasico' || versionParam === 'classic'
      ? false
      : cookieVersion === 'v3'
      ? true
      : cookieVersion === 'clasico'
      ? false
      : ctx.v3

  if (isV3) {
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
