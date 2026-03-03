import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import OrderHistory from '@/components/admin/OrderHistory'

export default async function OrderHistoryPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')
  if (!tenantSlug) notFound()

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <div className="flex items-center gap-3">
          <ClipboardList size={28} className="text-primary" />
          <h1 className="text-foreground text-4xl font-bold tracking-tight">Historial de pedidos</h1>
        </div>
        <p className="text-muted-foreground mt-2 font-medium">
          Consultá todos los pedidos con filtros por sede, estado y fechas.
        </p>
      </div>

      <OrderHistory tenantSlug={tenantSlug} />
    </div>
  )
}
