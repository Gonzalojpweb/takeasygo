import { headers } from 'next/headers'

export default async function TenantPage() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const tenantSlug = headersList.get('x-tenant-slug')

  return (
    <div>
      <h1>Tenant detectado</h1>
      <p>ID: {tenantId}</p>
      <p>Slug: {tenantSlug}</p>
    </div>
  )
}
