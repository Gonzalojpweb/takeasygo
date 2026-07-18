'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Home, Map, Compass, ShoppingBag, User } from 'lucide-react'
import { motion } from 'framer-motion'

const TABS = [
  { id: 'home', href: '/app', label: 'Inicio', icon: Home, isCenter: false },
  { id: 'map', href: '/app?view=map', label: 'Mapa', icon: Map, isCenter: false },
  { id: 'explore', href: '/app?view=list', label: 'Explorar', icon: Compass, isCenter: true },
  { id: 'orders', href: '/app?view=orders', label: 'Pedidos', icon: ShoppingBag, isCenter: false },
  { id: 'profile', href: '/app/profile', label: 'Perfil', icon: User, isCenter: false },
] as const

export default function BottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const currentView = searchParams.get('view') || 'home'

  const getActiveTab = (tab: typeof TABS[number]) => {
    if (tab.id === 'profile') return pathname === '/app/profile'
    if (tab.id === 'map') return currentView === 'map'
    if (tab.id === 'explore') return currentView === 'list'
    if (tab.id === 'orders') return currentView === 'orders'
    if (tab.id === 'home') return pathname === '/app' && (!searchParams.get('view') || currentView === 'home')
    return false
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[1000] pb-[safe-area-inset-bottom] h-[calc(64px+env(safe-area-inset-bottom,0px))]"
      aria-label="Navegación principal"
      style={{
        backgroundColor: 'var(--tgo-surface-0)',
        borderTop: '1px solid var(--tgo-border)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="max-w-lg mx-auto h-14 flex items-center justify-around px-2 relative">
        
        {TABS.map((tab) => {
          const isActive = getActiveTab(tab)
          const Icon = tab.icon

          if (tab.isCenter) {
            return (
              <div key={tab.id} className="relative w-16 h-full flex flex-col items-center justify-center">
                <button
                  onClick={() => router.push(tab.href)}
                  aria-label={tab.label}
                  className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all duration-300"
                  style={{
                    backgroundColor: isActive ? 'var(--tgo-state-interactive)' : 'var(--tgo-surface-1)',
                    color: isActive ? 'var(--tgo-text-on-interactive)' : 'var(--tgo-text-muted)',
                    transform: isActive ? 'scale(1.05)' : undefined,
                    boxShadow: isActive ? '0 4px 16px var(--tgo-state-interactive-soft)' : '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </button>
                <span
                  className="text-[10px] font-black uppercase mt-0.5 transition-colors"
                  style={{ color: isActive ? 'var(--tgo-state-interactive)' : 'var(--tgo-text-muted)' }}
                >
                  {tab.label}
                </span>
              </div>
            )
          }

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className="flex flex-col items-center justify-center gap-0.5 w-14 h-full transition-all active:scale-90"
            >
              <div
                className="relative flex items-center justify-center transition-colors"
                style={{ color: isActive ? 'var(--tgo-state-interactive)' : 'var(--tgo-text-muted)' }}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span
                className="text-[10px] font-bold tracking-tight transition-colors"
                style={{ color: isActive ? 'var(--tgo-state-interactive)' : 'var(--tgo-text-muted)' }}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
