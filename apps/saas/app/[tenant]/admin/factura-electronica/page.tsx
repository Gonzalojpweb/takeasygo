import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import FiscalPage from '@/components/admin/fiscal/FiscalPage'

// Factura electrónica (ARCA) — Fases 3 y 4 de caja. Los datos se cargan del lado del
// cliente desde /api/[tenant]/admin/fiscal (permiso settings.read / fiscal.configure).
export default async function FacturacionPage() {
  const tenantSlug = (await headers()).get('x-tenant-slug')
  if (!tenantSlug) notFound()
  return <FiscalPage tenantSlug={tenantSlug} />
}
