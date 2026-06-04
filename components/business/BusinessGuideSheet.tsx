'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  LogIn,
  Users,
  BarChart3,
  Lightbulb,
  Heart,
  ShoppingCart,
  Link2,
  CheckCircle2,
  Mail,
  Share2,
  CreditCard,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MagicCard } from '@/components/ui/magic-card'
import { BlurFade } from '@/components/ui/blur-fade'
import { TextAnimate } from '@/components/ui/text-animate'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantName?: string
}

const GRADIENT = {
  mode: 'gradient' as const,
  gradientColor: '#64748b',
  gradientOpacity: 0.08,
  gradientFrom: '#64748b',
  gradientTo: '#94a3b8',
}

function SectionTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
      <Icon size={12} /> {label}
    </h3>
  )
}

function InfoRow({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-slate-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function Tip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  )
}

function RoleHeader({
  icon: Icon,
  label,
  color,
}: {
  icon: LucideIcon
  label: string
  color: 'slate' | 'emerald'
}) {
  const cls =
    color === 'slate'
      ? 'bg-slate-100 text-slate-700 border-slate-200'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${cls}`}>
      <Icon size={12} /> {label}
    </div>
  )
}

function DemoStep({
  number,
  icon: Icon,
  title,
  description,
  color,
  isLast,
}: {
  number: number
  icon: LucideIcon
  title: string
  description: string
  color: 'slate' | 'emerald'
  isLast?: boolean
}) {
  const circleCls =
    color === 'slate'
      ? 'bg-slate-100 text-slate-700'
      : 'bg-emerald-100 text-emerald-700'
  const lineCls =
    color === 'slate' ? 'bg-slate-200' : 'bg-emerald-200'
  const iconCls =
    color === 'slate' ? 'text-slate-500' : 'text-emerald-500'
  const iconBgCls =
    color === 'slate' ? 'bg-slate-100' : 'bg-emerald-100'

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full ${circleCls} flex items-center justify-center text-sm font-bold shrink-0`}
        >
          {number}
        </div>
        {!isLast && <div className={`w-0.5 flex-1 ${lineCls} min-h-6`} />}
      </div>
      <div className={`flex-1 min-w-0 ${!isLast ? 'pb-5' : ''}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-6 h-6 rounded-md ${iconBgCls} flex items-center justify-center`}>
            <Icon size={12} className={iconCls} />
          </div>
        </div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

export default function BusinessGuideSheet({ open, onOpenChange, tenantName = 'Takeasygo' }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-3/4 sm:max-w-sm p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-0 border-b border-border/40 pr-8">
          <SheetTitle className="text-base flex items-center gap-2">
            <Building2 size={16} className="text-primary" />
            Guía rápida · Business
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="guide" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-3 pb-0 shrink-0">
            <TabsList className="w-full">
              <TabsTrigger value="guide" className="flex-1 text-xs">
                📖 Guía
              </TabsTrigger>
              <TabsTrigger value="demo" className="flex-1 text-xs">
                🎬 Demo
                <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0 h-3.5 leading-none">
                  PASO A PASO
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="guide" className="flex-1 overflow-y-auto px-5 py-4 space-y-5 mt-0">
            {/* Section 1 — Company */}
            <BlurFade delay={0}>
              <MagicCard {...GRADIENT} className="rounded-xl p-4">
                <SectionTitle icon={Building2} label="Para la empresa" />
                <div className="space-y-3 mt-3">
                  <InfoRow
                    icon={LogIn}
                    title="Pedido individual"
                    description="Cada colaborador ingresa con su email y pide directo con precio corporativo."
                  />
                  <InfoRow
                    icon={Users}
                    title="Pedido grupal"
                    description="El admin crea sesión, comparte link, todos agregan items en una sola orden."
                  />
                  <InfoRow
                    icon={BarChart3}
                    title="Portal corporativo"
                    description="Historial, conciliación mensual y gestión de empleados desde un solo lugar."
                  />
                </div>
              </MagicCard>
            </BlurFade>

            {/* Section 2 — Employees */}
            <BlurFade delay={0.1}>
              <MagicCard {...GRADIENT} className="rounded-xl p-4">
                <SectionTitle icon={Users} label="Para empleados" />
                <div className="space-y-3 mt-3">
                  <InfoRow
                    icon={ShoppingCart}
                    title="Tu pedido individual"
                    description="Pedí directo con precio especial de tu empresa. Rápido y sin complicaciones."
                  />
                  <InfoRow
                    icon={Link2}
                    title="Unirte a sesión grupal"
                    description="Ingresá el código que te compartió tu admin y agregá tus items al pedido grupal."
                  />
                </div>
              </MagicCard>
            </BlurFade>

            {/* Section 3 — Tips */}
            <BlurFade delay={0.2}>
              <MagicCard {...GRADIENT} className="rounded-xl p-4">
                <SectionTitle icon={Lightbulb} label="Tips y recomendaciones" />
                <div className="space-y-2 mt-3">
                  <Tip text="Agendá con anticipación en horarios pico para evitar demoras" />
                  <Tip text="Usá pedidos grupales para reuniones de equipo y eventos" />
                  <Tip text="Centralizá la facturación mensual para mejor control" />
                  <Tip text="Asigná un admin por sede para gestionar los pedidos" />
                </div>
              </MagicCard>
            </BlurFade>

            {/* Section 4 — Restaurant message */}
            <BlurFade delay={0.3}>
              <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                  <Heart size={18} className="text-white" />
                </div>
                <TextAnimate
                  animation="blurInUp"
                  by="word"
                  className="text-white/90 text-xs leading-relaxed font-medium"
                >
                  Este canal ayuda a tu equipo a maximizar la operación, mejorar los tiempos, mantener el
                  orden en los pedidos y optimizar los procesos internos para brindarles un servicio de
                  calidad.
                </TextAnimate>
                <p className="text-white/50 text-xs mt-3 font-semibold tracking-tight">
                  — El equipo de {tenantName}
                </p>
              </div>
            </BlurFade>
          </TabsContent>

          <TabsContent value="demo" className="flex-1 overflow-y-auto px-5 py-4 space-y-5 mt-0">
            {/* Admin steps */}
            <BlurFade delay={0}>
              <MagicCard {...GRADIENT} className="rounded-xl p-4">
                <RoleHeader icon={Building2} label="ADMIN" color="slate" />
                <div className="mt-4 space-y-1">
                  <DemoStep
                    number={1}
                    icon={Mail}
                    title="Ingresá tu email corporativo"
                    description="Usá el email registrado por tu empresa para acceder al sistema."
                    color="slate"
                  />
                  <DemoStep
                    number={2}
                    icon={LogIn}
                    title="Elegí cómo querés pedir"
                    description="Pedido individual, crear sesión grupal o ir al portal corporativo."
                    color="slate"
                  />
                  <DemoStep
                    number={3}
                    icon={Share2}
                    title="Compartí el acceso con tu equipo"
                    description="Si creaste una sesión grupal, compartí el link o código con tus empleados."
                    color="slate"
                  />
                  <DemoStep
                    number={4}
                    icon={BarChart3}
                    title="Gestioná desde el portal"
                    description="Revisá histórico de pedidos, conciliaciones y administrá empleados."
                    color="slate"
                    isLast
                  />
                </div>
              </MagicCard>
            </BlurFade>

            {/* Employee steps */}
            <BlurFade delay={0.15}>
              <MagicCard {...GRADIENT} className="rounded-xl p-4">
                <RoleHeader icon={Users} label="EMPLEADO" color="emerald" />
                <div className="mt-4 space-y-1">
                  <DemoStep
                    number={1}
                    icon={Mail}
                    title="Ingresá tu email corporativo"
                    description="Usá el email de tu empresa para acceder con precios especiales."
                    color="emerald"
                  />
                  <DemoStep
                    number={2}
                    icon={Users}
                    title="Elegí tu modalidad"
                    description="Pedido individual o unite a una sesión grupal con el código que te dieron."
                    color="emerald"
                  />
                  <DemoStep
                    number={3}
                    icon={ShoppingCart}
                    title="Agregá tus items al carrito"
                    description="Navegá el menú digital y agregá todos los productos que quieras."
                    color="emerald"
                  />
                  <DemoStep
                    number={4}
                    icon={CreditCard}
                    title="Pagá con precio corporativo"
                    description="Todo directo con el precio especial de tu empresa, sin esperas."
                    color="emerald"
                    isLast
                  />
                </div>
              </MagicCard>
            </BlurFade>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
