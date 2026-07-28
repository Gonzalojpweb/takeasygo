'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Home, Map, Compass, ShoppingBag, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useHaptic } from '@/components/tgo/useHaptic'
import { microcopy } from '@/components/tgo/microcopy'

const TABS = [
  { id: 'home', href: '/app', label: microcopy.nav.home, icon: Home, isCenter: false },
  { id: 'map', href: '/app?view=map', label: microcopy.nav.map, icon: Map, isCenter: false },
  { id: 'explore', href: '/app?view=list', label: microcopy.nav.discover, icon: Compass, isCenter: true },
  { id: 'orders', href: '/app?view=orders', label: microcopy.nav.orders, icon: ShoppingBag, isCenter: false },
  { id: 'profile', href: '/app/profile', label: microcopy.nav.profile, icon: User, isCenter: false },
] as const

export default function BottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const haptic = useHaptic()
  
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
        backgroundColor: 'var(--tgo-surface-card)',
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
                  onClick={() => { haptic.selection(); router.push(tab.href) }}
                  aria-label={tab.label}
                  className="tgo-nav-center w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 active:scale-90"
                  style={{
                    backgroundColor: isActive ? 'var(--tgo-state-action)' : 'var(--tgo-surface-1)',
                    color: isActive ? 'var(--tgo-text-inverse)' : 'var(--tgo-text-muted)',
                    transform: isActive ? 'scale(1.05)' : undefined,
                    boxShadow: isActive ? '0 4px 16px var(--tgo-state-action-soft)' : '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </button>
                <span
                  className="text-[10px] font-black uppercase mt-0.5 transition-colors"
                   style={{ color: isActive ? 'var(--tgo-state-action)' : 'var(--tgo-text-muted)' }}
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
                style={{ color: isActive ? 'var(--tgo-state-trust)' : 'var(--tgo-text-muted)' }}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span
                className="text-[10px] font-bold tracking-tight transition-colors"
                style={{ color: isActive ? 'var(--tgo-state-trust)' : 'var(--tgo-text-muted)' }}
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
