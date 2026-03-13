import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Reservation from '@/models/Reservation'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ReservasPanel from '@/components/admin/ReservasPanel'
import type { Plan } from '@/lib/plans'
import { canAccess, requiredPlanFor, PLAN_LABELS } from '@/lib/plans'
import { Lock } from 'lucide-react'

export default async function ReservasPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  if (!canAccess(plan, 'reservations')) {
    const required = requiredPlanFor('reservations')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reservaciones</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Esta funcionalidad está disponible en el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[required]}</span>.
            Contactá al soporte para actualizar tu plan.
          </p>
        </div>
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
      </div>
    )
  }

  if (!tenant.features?.reservations) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reservaciones no habilitadas</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            El módulo de reservaciones no está activo para tu cuenta. Contactá al soporte para habilitarlo.
          </p>
        </div>
      </div>
    )
  }

  const tenantId = tenant._id

  // Fetch locations that have reservations enabled
  const locations = await Location.find({ tenantId, isActive: true }).lean() as any[]

  // Fetch reservations for the next 30 days + past 7 days
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 7)
  const to = new Date(today)
  to.setDate(to.getDate() + 30)

  const fromStr = from.toISOString().split('T')[0]
  const toStr = to.toISOString().split('T')[0]

  const reservations = await Reservation.find({
    tenantId,
    date: { $gte: fromStr, $lte: toStr },
  }).sort({ date: 1, time: 1 }).lean() as any[]

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Reservaciones</h1>
        <p className="text-muted-foreground mt-2 font-medium">Gestioná las reservas y confirmaciones de tus mesas.</p>
      </div>

      <ReservasPanel
        reservations={JSON.parse(JSON.stringify(reservations))}
        locations={JSON.parse(JSON.stringify(locations))}
        tenantSlug={tenantSlug || ''}
      />
    </div>
  )
}
