import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import type { Types } from 'mongoose'
import { CheckCircle2, Circle, ChevronRight, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Step {
  id: string
  label: string
  description: string
  done: boolean
  href: string
  cta: string
}

interface Props {
  tenantId: Types.ObjectId
  tenantSlug: string
  logoUrl: string
}

export default async function OnboardingChecklist({ tenantId, tenantSlug, logoUrl }: Props) {
  await connectDB()

  const base = `/${tenantSlug}/admin`

  const [location, menu, order] = await Promise.all([
    Location.findOne({ tenantId }).lean<{ networkVisible: boolean }>(),
    Menu.findOne({ tenantId }).lean<{ categories: { items: unknown[] }[] }>(),
    Order.exists({ tenantId }),
  ])

  const hasLocation     = !!location
  const networkVisible  = !!(location?.networkVisible)
  const hasMenuItems    = !!(menu?.categories?.some((c) => c.items.length > 0))
  const hasOrder        = !!order
  const hasLogo         = !!logoUrl

  const steps: Step[] = [
    {
      id: 'branding',
      label: 'Personalizá tu perfil',
      description: 'Subí tu logo y elegí los colores de tu marca',
      done: hasLogo,
      href: `${base}/settings`,
      cta: 'Ir a configuración',
    },
    {
      id: 'location',
      label: 'Creá tu primera sede',
      description: 'Configurá la dirección y horarios de atención',
      done: hasLocation,
      href: `${base}/settings`,
      cta: 'Agregar sede',
    },
    {
      id: 'menu',
      label: 'Cargá tu menú',
      description: 'Añadí categorías y productos con precios',
      done: hasMenuItems,
      href: `${base}/menu`,
      cta: 'Ir al menú',
    },
    {
      id: 'network',
      label: 'Activá tu sede en la red',
      description: 'Hacé que tu restaurante aparezca en el mapa público',
      done: networkVisible,
      href: `${base}/settings`,
      cta: 'Activar visibilidad',
    },
    {
      id: 'order',
      label: 'Recibí tu primer pedido',
      description: 'Compartí el link de tu menú con tus clientes',
      done: hasOrder,
      href: `/${tenantSlug}/menu`,
      cta: 'Ver mi menú',
    },
  ]

  const doneCount = steps.filter((s) => s.done).length

  // Ocultar si todo está completo
  if (doneCount === steps.length) return null

  const pct = Math.round((doneCount / steps.length) * 100)

  return (
    <div className="rounded-3xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-primary/10">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Rocket size={20} className="text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Configuración inicial</p>
          <p className="text-xs text-muted-foreground font-medium">
            {doneCount} de {steps.length} pasos completados
          </p>
        </div>
        {/* Progress bar */}
        <div className="hidden sm:flex flex-col items-end gap-1 min-w-[120px]">
          <span className="text-xs font-black text-primary">{pct}%</span>
          <div className="h-2 w-32 rounded-full bg-primary/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-primary/10">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-4 px-6 py-4 transition-colors',
              step.done ? 'opacity-50' : 'hover:bg-primary/5'
            )}
          >
            {/* Icon */}
            <div className="shrink-0">
              {step.done ? (
                <CheckCircle2 size={22} className="text-primary" />
              ) : (
                <Circle size={22} className="text-primary/30" />
              )}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-bold',
                step.done ? 'line-through text-muted-foreground' : 'text-foreground'
              )}>
                {step.label}
              </p>
              {!step.done && (
                <p className="text-xs text-muted-foreground font-medium">{step.description}</p>
              )}
            </div>

            {/* CTA */}
            {!step.done && (
              <Link
                href={step.href}
                className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary hover:opacity-70 transition-opacity"
              >
                {step.cta}
                <ChevronRight size={14} />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
