import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import PrintersManager from '@/components/admin/PrintersManager'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS } from '@/lib/plans'
import { AlertTriangle } from 'lucide-react'

export default async function PrintersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'
  const isTryPlan = plan === 'try'

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

      {isTryPlan && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-600">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-bold">Plan {PLAN_LABELS.try}:</span> podés configurar hasta 1 impresora.
            Actualizá a <span className="font-bold">{PLAN_LABELS.buy}</span> para agregar múltiples impresoras por sede.
          </div>
        </div>
      )}

      <PrintersManager
        tenantSlug={tenantSlug ?? ''}
        printers={JSON.parse(JSON.stringify(printers))}
        locations={JSON.parse(JSON.stringify(locations))}
        plan={plan}
      />
    </div>
  )
}
