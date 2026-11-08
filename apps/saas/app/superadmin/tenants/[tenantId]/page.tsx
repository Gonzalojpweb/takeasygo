import { redirect } from 'next/navigation'

// La ficha del comercio es /edit. Varios paneles (ingresos, tracción de la red)
// enlazan a /superadmin/tenants/<id>: sin esta página daban 404.
export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  redirect(`/superadmin/tenants/${tenantId}/edit`)
}
