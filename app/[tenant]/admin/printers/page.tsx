import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import PrintersManager from '@/components/admin/PrintersManager'

export default async function PrintersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const locations = await Location.find({ tenantId: tenant._id, isActive: true }).lean()
  const printers = await Printer.find({ tenantId: tenant._id }).sort({ createdAt: 1 }).lean()

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Impresoras</h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Configurá impresoras térmicas por sede y gestioná los roles de impresión.
        </p>
      </div>

      <PrintersManager
        tenantSlug={tenantSlug ?? ''}
        printers={JSON.parse(JSON.stringify(printers))}
        locations={JSON.parse(JSON.stringify(locations))}
      />
    </div>
  )
}
