import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Sparkles, ChevronRight, UtensilsCrossed, Tag, CreditCard } from 'lucide-react'
import type { Types } from 'mongoose'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, PLAN_COLORS } from '@/lib/plans'
import OnboardingChecklist from '@/components/admin/OnboardingChecklist'
import Link from 'next/link'

// Dashboard client components (each fetches from its own API route)
import StatsCards from '@/components/admin/dashboard/StatsCards'
import KPIsMes from '@/components/admin/dashboard/KPIsMes'
import { ICOWidget } from '@/components/admin/dashboard/ICOWidget'
import MetodosPago from '@/components/admin/dashboard/MetodosPago'
import { ComisionesBanner } from '@/components/admin/dashboard/ComisionesBanner'
import MenuActividad from '@/components/admin/dashboard/MenuActividad'
import CalificacionesWidget from '@/components/admin/dashboard/CalificacionesWidget'
import ClubWidget from '@/components/admin/dashboard/ClubWidget'
import PedidosRecientes from '@/components/admin/dashboard/PedidosRecientes'

function PlanBanner({ plan, trialOrderCount, tenantSlug }: { plan: Plan; trialOrderCount?: number; tenantSlug: string }) {
  if (plan === 'full' || plan === 'anfitrion') return null

  if (plan === 'trial') {
    const count = trialOrderCount ?? 0
    const isReady = count >= 30
    return (
      <div className={cn(
        'flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium',
        PLAN_COLORS.trial
      )}>
        <Sparkles size={16} className="shrink-0" />
        {isReady ? (
          <>
            <span className="flex-1">Procesaste 30 pedidos. Tu Informe ICO de Contexto está listo.</span>
            <a href={`/${tenantSlug}/admin/ico`} className="flex items-center gap-1 text-xs font-bold shrink-0 opacity-80 hover:opacity-100">
              Ver Informe <ChevronRight size={12} />
            </a>
          </>
        ) : (
          <>
            <span className="flex-1">Trial activo — {count} de 30 pedidos para tu Informe ICO.</span>
            <span className="flex items-center gap-1 text-xs font-bold shrink-0 opacity-60">
              {30 - count} restantes
            </span>
          </>
        )}
      </div>
    )
  }

  const messages: Record<'try' | 'buy', { text: string; cta: string }> = {
    try: {
      text: `Estás en el plan ${PLAN_LABELS.try}. Accedé a reportes, múltiples sedes y más.`,
      cta: 'Ver planes',
    },
    buy: {
      text: `Estás en el plan ${PLAN_LABELS.buy}. Desbloqueá analytics avanzados e ICO completo con Premium.`,
      cta: 'Saber más',
    },
  }

  const msg = messages[plan as 'try' | 'buy']

  return (
    <div className={cn(
      'flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium',
      PLAN_COLORS[plan]
    )}>
      <Sparkles size={16} className="shrink-0" />
      <span className="flex-1">{msg.text}</span>
      <span className="flex items-center gap-1 text-xs font-bold shrink-0 opacity-80 hover:opacity-100 cursor-pointer">
        {msg.cta} <ChevronRight size={12} />
      </span>
    </div>
  )
}

export default async function AdminDashboard() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  // Minimal query: only plan, logo, and userName needed for layout
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('plan branding.logoUrl')
    .lean<{ _id: Types.ObjectId; plan: Plan; branding: { logoUrl: string } }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  // Get userName from auth session for ICOWidget personalization
  let userName = ''
  try {
    const { auth } = await import('@/lib/auth')
    const session = await auth()
    userName = session?.user?.name ?? session?.user?.email ?? ''
  } catch {
    // auth may fail in some contexts, fallback to empty
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <PlanBanner plan={plan} tenantSlug={tenantSlug!} />

      <OnboardingChecklist
        tenantId={tenant._id}
        tenantSlug={tenantSlug!}
        logoUrl={tenant.branding?.logoUrl ?? ''}
      />

      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white p-6">
        <div className="relative z-10 max-w-xl">
          <h2 className="text-xl font-semibold tracking-tight">Panel de control</h2>
          <p className="text-slate-400 text-sm mt-1" suppressHydrationWarning>
            Resumen operativo · {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
      </div>

      {/* Stats compactas */}
      <StatsCards tenantSlug={tenantSlug!} />

      {/* Quick Actions */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white">
        <p className="text-sm font-medium text-white/80 mb-3">Acciones de Gestión</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/${tenantSlug}/admin/menu`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium backdrop-blur-sm">
            <UtensilsCrossed size={16} />
            Gestionar Menú
          </Link>
          <Link href={`/${tenantSlug}/admin/promotions`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium backdrop-blur-sm">
            <Tag size={16} />
            Promociones
          </Link>
          <Link href={`/${tenantSlug}/admin/billing`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium backdrop-blur-sm">
            <CreditCard size={16} />
            Control de Caja
          </Link>
          <Link href={`/${tenantSlug}/admin/reports`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium backdrop-blur-sm">
            <CreditCard size={16} />
            Ver Reportes
          </Link>
        </div>
      </div>

      {/* KPIs del mes */}
      <KPIsMes tenantSlug={tenantSlug!} />

      {/* ICO */}
      <ICOWidget tenantSlug={tenantSlug!} userName={userName} />

      {/* Métodos de pago */}
      <MetodosPago tenantSlug={tenantSlug!} />

      {/* Comisiones pendientes */}
      <ComisionesBanner tenantSlug={tenantSlug!} />

      {/* Actividad del menú */}
      <MenuActividad tenantSlug={tenantSlug!} />

      {/* Calificaciones */}
      <CalificacionesWidget tenantSlug={tenantSlug!} />

      {/* Club */}
      <ClubWidget tenantSlug={tenantSlug!} />

      {/* Pedidos recientes */}
      <PedidosRecientes tenantSlug={tenantSlug!} />
    </div>
  )
}
