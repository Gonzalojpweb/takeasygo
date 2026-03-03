import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Shield } from 'lucide-react'
import AuditLogViewer from '@/components/admin/AuditLogViewer'

export default async function AuditPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'superadmin') {
    redirect('/')
  }

  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')
  if (!tenantSlug) notFound()

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <div className="flex items-center gap-3">
          <Shield size={28} className="text-primary" />
          <h1 className="text-foreground text-4xl font-bold tracking-tight">Auditoría</h1>
        </div>
        <p className="text-muted-foreground mt-2 font-medium">
          Registro de todas las acciones realizadas por los usuarios del sistema.
        </p>
      </div>

      <AuditLogViewer tenantSlug={tenantSlug} />
    </div>
  )
}
