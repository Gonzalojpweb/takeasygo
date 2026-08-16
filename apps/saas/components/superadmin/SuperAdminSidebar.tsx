'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Store,
  BarChart3,
  LogOut,
  UserCheck,
  Globe,
  BookMarked,
  Settings,
  HeartPulse,
  Shield,
  Users,
  Eye,
  Gift,
  Megaphone,
  ChevronRight,
  MessageSquare,
  MessageCircle,
  Building2,
  Tag,
  Trophy,
  ShoppingBag,
  QrCode,
  BookOpen,
  Printer,
  Smartphone,
  DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { signOut } from 'next-auth/react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

interface NavGroup {
  section: string
  items: NavItem[]
}

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
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
        {isActive && <ChevronRight size={14} className="text-primary/70" />}
      </div>
    </Link>
  )
}

export default function SuperAdminSidebar() {
  const pathname = usePathname()

  const groups: NavGroup[] = [
    {
      section: 'Principal',
      items: [
        { href: '/superadmin', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      section: 'Gestión',
      items: [
        { href: '/superadmin/tenants', label: 'Tenants', icon: Store },
        { href: '/superadmin/usuarios', label: 'Usuarios', icon: Users },
        { href: '/superadmin/business/companies', label: 'Empresas Business', icon: Building2 },
        { href: '/superadmin/sellers', label: 'Vendedores', icon: UserCheck },
        { href: '/superadmin/consumers', label: 'Consumidores', icon: Users },
        { href: '/superadmin/app-consumers', label: 'Consumidores App', icon: Smartphone },
        { href: '/superadmin/leads', label: 'Leads', icon: Eye },
      ],
    },
    {
      section: 'Red',
      items: [
        { href: '/superadmin/red', label: 'Red', icon: Globe },
        { href: '/superadmin/directory', label: 'Directorio', icon: BookMarked },
        { href: '/superadmin/salud', label: 'Salud de Red', icon: HeartPulse },
        { href: '/superadmin/visitas', label: 'Visitas', icon: Eye },
        { href: '/superadmin/invite-scans', label: 'Scans QR Invite', icon: QrCode },
      ],
    },
    {
      section: 'Inteligencia',
      items: [
        { href: '/superadmin/analytics', label: 'Analytics', icon: BarChart3 },
        { href: '/superadmin/auditoria', label: 'Auditoría', icon: Shield },
        { href: '/superadmin/feedback', label: 'Feedback UX', icon: MessageSquare },
        { href: '/superadmin/comisiones', label: 'Comisiones', icon: DollarSign },
      ],
    },
    {
      section: 'Marketing',
      items: [
        { href: '/superadmin/app-stories', label: 'Stories de la App', icon: Smartphone },
        { href: '/superadmin/promotions', label: 'Promociones Globales', icon: Tag },
        { href: '/superadmin/store-items', label: 'Ofertas Globales', icon: ShoppingBag },
        { href: '/superadmin/club', label: 'Club Global', icon: Trophy },
        { href: '/superadmin/club/whatsapp-reward-advance', label: 'Club WhatsApp', icon: MessageCircle },
        { href: '/superadmin/marketing-qr/promos', label: 'QrPromos Globales', icon: QrCode },
        { href: '/superadmin/marketing-qr', label: 'Marketing QR', icon: Gift },
        { href: '/superadmin/announcements', label: 'Anuncios', icon: Megaphone },
      ],
    },
    {
      section: 'Developer',
      items: [
        { href: '/superadmin/developer', label: 'Documentación', icon: BookOpen },
      ],
    },
    {
      section: 'Sistema',
      items: [
        { href: '/superadmin/push', label: 'Push Notifications', icon: Smartphone },
        { href: '/superadmin/printer-agent', label: 'Agente de Impresión', icon: Printer },
        { href: '/superadmin/configuracion', label: 'Configuración', icon: Settings },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="text-white font-semibold text-base leading-none tracking-tight">TakeasyGo</h1>
            <p className="text-sidebar-foreground/40 text-[10px] font-medium mt-0.5">Super Admin</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto min-h-0 space-y-1">
        {groups.map((group) => (
          <div key={group.section} className="pb-2">
            <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/30">
              {group.section}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href
                return <NavLink key={item.href} item={item} isActive={isActive} />
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-sidebar-border/30 mt-auto">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Cerrar sesión</span>
        </Button>
      </div>
    </div>
  )
}
