'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Store, BarChart3, LogOut, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { signOut } from 'next-auth/react'

export default function SuperAdminSidebar() {
    const pathname = usePathname()

    const navItems = [
        { href: '/superadmin', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/superadmin/tenants', label: 'Tenants', icon: Store },
        { href: '/superadmin/analytics', label: 'Analytics', icon: BarChart3 },
    ]

    return (
        <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
            <div className="p-8">
                <h1 className="text-white font-bold text-xl tracking-tight">Menu Platform</h1>
                <p className="text-primary text-[10px] mt-1 uppercase tracking-[0.2em] font-bold">Super Admin</p>
            </div>

            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href

                    return (
                        <Link key={item.href} href={item.href}>
                            <div className={cn(
                                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-300 group',
                                isActive
                                    ? 'bg-primary text-white shadow-xl shadow-primary/20 font-bold'
                                    : 'text-sidebar-foreground/70 hover:text-white hover:bg-white/5'
                            )}>
                                <Icon size={20} className={cn(
                                    'transition-all duration-300',
                                    isActive ? 'text-white' : 'text-primary'
                                )} />
                                <span className="tracking-wide">{item.label}</span>
                                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />}
                            </div>
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 border-t border-white/5">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 px-4 py-6 rounded-xl text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all duration-300 group"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                >
                    <LogOut size={20} className="group-hover:scale-110 transition-transform" />
                    <span className="font-bold tracking-tight">Cerrar sesión</span>
                </Button>
            </div>
        </div>
    )
}
