import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import PrintersManager from '@/components/admin/PrintersManager'
import { type Plan, canAccess, PLAN_LABELS, PRINTER_LIMIT } from '@/lib/plans'
import { AlertTriangle } from 'lucide-react'
import { getPageScope } from '@/lib/page-scope'

export default async function PrintersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  if (!canAccess(plan, 'printers')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <AlertTriangle size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Impresoras</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Esta funcionalidad no está incluida en el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[plan]}</span>.
            Contactá al soporte para actualizar tu plan.
          </p>
        </div>
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
      </div>
    )
  }

  const printerLimit = PRINTER_LIMIT[plan] ?? PRINTER_LIMIT.try
  const posEnabled = Boolean(tenant.features?.posEnabled)

  // Alcance de sede del usuario (permisos frescos): un usuario de sede solo
  // recibe datos de sus sedes.
  const pageScope = await getPageScope()
  const locations = await Location.find({ tenantId: tenant._id, isActive: true, ...pageScope.sedeFilter }).lean()
  const printers = await Printer.find({ tenantId: tenant._id, ...pageScope.locationFilter }).sort({ createdAt: 1 }).lean()

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Impresoras</h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Configurá impresoras térmicas por sede y gestioná los roles de impresión.
        </p>
      </div>

      <div className="flex items-start gap-3 px-5 py-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-600">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-bold">Plan {PLAN_LABELS[plan]}:</span> hasta {printerLimit} impresoras activas por sede.
          {posEnabled
            ? ' Con POS, qué imprime cada una (comandas, precuenta, facturas, reportes de caja) se configura en el POS › Configuración › Impresoras.'
            : ' Desde el panel web se imprimen comandas y tickets no fiscales.'}
        </div>
      </div>

      <PrintersManager
        tenantSlug={tenantSlug ?? ''}
        printers={JSON.parse(JSON.stringify(printers))}
        locations={locations.map((l: any) => ({
          _id: String(l._id),
          name: l.name,
          // Solo el estado del agente: nunca el hash del token ni el resto
          // del documento de la sede (credenciales de integraciones).
          agent: {
            hasToken: Boolean(l.printerAgent?.secretHash),
            lastSeenAt: l.printerAgent?.lastSeenAt ? new Date(l.printerAgent.lastSeenAt).toISOString() : null,
            version: l.printerAgent?.version ?? null,
            tokenPresent: Boolean(l.printerAgent?.tokenPresent),
          },
        }))}
        plan={plan}
        printerLimit={printerLimit}
        posEnabled={posEnabled}
      />
    </div>
  )
}
