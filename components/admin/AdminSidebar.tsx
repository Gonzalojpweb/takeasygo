'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Printer,
  ClipboardList,
  Shield,
  Activity,
  Lock,
  CalendarDays,
  CreditCard,
  BookOpen,
  QrCode,
  Tag,
  Gift,
  Database,
  TrendingUp,
  Bell,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { Plan, Feature } from '@/lib/plans'
import { canAccess, requiredPlanFor, PLAN_LABELS } from '@/lib/plans'

interface Props {
  tenantSlug: string
  userRole: string
  userName: string
  plan: Plan
  dineInOnly?: boolean
  unreadAnnouncements?: number
}

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: string[]
  feature?: Feature
  requiresTakeaway?: boolean
  badge?: number
}

interface NavGroup {
  section: string
  items: NavItem[]
}

function LockedNavItem({
  label,
  icon: Icon,
  requiredPlan,
  reason = 'plan',
}: {
  label: string
  icon: React.ElementType
  requiredPlan?: Plan
  reason?: 'plan' | 'mode'
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg opacity-40 cursor-not-allowed select-none">
      <Icon size={18} className="text-sidebar-foreground/50" />
      <span className="text-sm text-sidebar-foreground/60">{label}</span>
      <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/5 text-sidebar-foreground/40">
        <Lock size={10} />
        {reason === 'mode' ? 'Takeaway' : (requiredPlan ? PLAN_LABELS[requiredPlan] : '')}
      </span>
    </div>
  )
}

function NavLink({
  item,
  isActive,
}: {
  item: NavItem
  isActive: boolean
}) {
  const Icon = item.icon
  return (
    <Link href={item.href} className="group block">
      <div
        className={cn(
          'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/5'
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
        )}
        <Icon
          size={18}
          className={cn(
            'transition-colors duration-200',
            isActive ? 'text-primary' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70'
          )}
        />
        <span className="flex-1">{item.label}</span>
        {!!item.badge && item.badge > 0 && (
          <span className="shrink-0 bg-red-500/90 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
        {isActive && !item.badge && (
          <ChevronRight size={14} className="text-primary/70" />
        )}
      </div>
    </Link>
  )
}

export default function AdminSidebar({ tenantSlug, userRole, userName, plan, dineInOnly = false, unreadAnnouncements = 0 }: Props) {
  const pathname = usePathname()
  const base = `/${tenantSlug}/admin`

  const groups: NavGroup[] = [
    {
      section: 'Principal',
      items: [
        { href: base, label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff', 'cashier'] },
      ],
    },
    {
      section: 'Operaciones',
      items: [
        { href: `${base}/orders`, label: 'Pedidos', icon: ShoppingBag, roles: ['admin', 'manager', 'staff', 'cashier'], feature: 'orders', requiresTakeaway: true },
        { href: `${base}/orders/history`, label: 'Historial', icon: ClipboardList, roles: ['admin', 'manager', 'cashier'], feature: 'orderHistory', requiresTakeaway: true },
        { href: `${base}/reservas`, label: 'Reservaciones', icon: CalendarDays, roles: ['admin', 'manager'], feature: 'reservations' },
        { href: `${base}/printers`, label: 'Impresoras', icon: Printer, roles: ['admin', 'manager'], feature: 'printers', requiresTakeaway: true },
      ],
    },
    {
      section: 'Catálogo',
      items: [
        { href: `${base}/menu`, label: 'Menú', icon: UtensilsCrossed, roles: ['admin', 'manager'] },
      ],
    },
    {
      section: 'Marketing',
      items: [
        { href: `${base}/promotions`, label: 'Promociones', icon: Tag, roles: ['admin', 'manager'] },
        { href: `${base}/marketing-qr`, label: 'Marketing QR', icon: Gift, roles: ['admin', 'manager'] },
        { href: `${base}/club`, label: 'Club', icon: QrCode, roles: ['admin', 'manager'], feature: 'loyaltyClub' },
        { href: `${base}/store`, label: 'Tienda', icon: Gift, roles: ['admin', 'manager'], feature: 'loyaltyClub' },
      ],
    },
    {
      section: 'Inteligencia',
      items: [
        { href: `${base}/reports`, label: 'Reportes', icon: BarChart3, roles: ['admin', 'manager'], feature: 'reports', requiresTakeaway: true },
        { href: `${base}/analytics`, label: 'Analytics', icon: TrendingUp, roles: ['admin', 'manager'] },
        { href: `${base}/ico`, label: 'ICO', icon: Activity, roles: ['admin'], feature: 'ico', requiresTakeaway: true },
        { href: `${base}/audit`, label: 'Auditoría', icon: Shield, roles: ['admin'], feature: 'audit' },
      ],
    },
    {
      section: 'Configuración',
      items: [
        { href: `${base}/users`, label: 'Usuarios', icon: Users, roles: ['admin'], feature: 'users' },
        { href: `${base}/billing`, label: 'Facturación', icon: CreditCard, roles: ['admin'] },
        { href: `${base}/settings`, label: 'Configuración', icon: Settings, roles: ['admin'] },
        { href: `${base}/settings/pos`, label: 'Integración POS', icon: Database, roles: ['admin'], feature: 'posIntegration' },
      ],
    },
    {
      section: 'Soporte',
      items: [
        { href: `${base}/ayuda`, label: 'Centro de Ayuda', icon: BookOpen, roles: ['admin', 'manager', 'staff', 'cashier'] },
        { href: `${base}/updates`, label: 'Novedades', icon: Bell, roles: ['admin', 'manager'], badge: unreadAnnouncements },
      ],
    },
  ]

  const effectiveRole = userRole === 'superadmin' ? 'admin' : userRole

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground transition-all duration-300">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="text-white font-semibold text-base leading-none tracking-tight">TakeasyGo</h1>
            <p className="text-sidebar-foreground/40 text-[10px] font-medium mt-0.5">{tenantSlug}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto min-h-0 space-y-1 h-full max-h-[calc(100vh-200px)]">
        {groups.map((group) => {
          const visibleItems = group.items.filter(item => item.roles.includes(effectiveRole))
          if (visibleItems.length === 0) return null

          return (
            <div key={group.section} className="pb-2">
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/30">
                {group.section}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon

                  const isModeLocked = dineInOnly && !!item.requiresTakeaway
                  const isPlanLocked = !isModeLocked && item.feature
                    ? (item.feature === 'ico' && plan === 'trial') ? false : !canAccess(plan, item.feature)
                    : false

                  if (isModeLocked) {
                    return (
                      <LockedNavItem
                        key={item.href}
                        label={item.label}
                        icon={Icon}
                        reason="mode"
                      />
                    )
                  }

                  if (isPlanLocked && item.feature) {
                    return (
                      <LockedNavItem
                        key={item.href}
                        label={item.label}
                        icon={Icon}
                        requiredPlan={requiredPlanFor(item.feature)}
                        reason="plan"
                      />
                    )
                  }

                  const isActive = pathname === item.href

                  return (
                    <NavLink key={item.href} item={item} isActive={isActive} />
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-sidebar-border/30 mt-auto">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.03]">
          <Avatar className="h-9 w-9 border border-sidebar-border/50">
            <AvatarFallback className="bg-primary/20 text-primary text-[11px] font-bold">
              {userName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-foreground text-sm font-medium truncate leading-none">{userName}</p>
            <p className="text-sidebar-foreground/40 text-[10px] capitalize mt-1 leading-none">{userRole}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/30 hover:text-destructive hover:bg-destructive/10 h-8 w-8 rounded-lg transition-colors"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
