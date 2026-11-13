'use client'

// ── BottomNav ───────────────────────────────────────────────────────────────
//
// Barra de navegación flotante de /app. Mismas cinco secciones de siempre;
// cambia la forma: una isla que flota sobre el contenido (por eso lleva
// sombra) con un indicador que se desliza hacia la sección activa.

import { useSyncExternalStore } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Home, Map, Compass, ShoppingBag, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useHaptic } from '@/components/tgo/useHaptic'
import { microcopy } from '@/components/tgo/microcopy'

const TABS = [
  { id: 'home', href: '/app', label: microcopy.nav.home, icon: Home },
  { id: 'map', href: '/app?view=map', label: microcopy.nav.map, icon: Map },
  { id: 'explore', href: '/app?view=list', label: microcopy.nav.discover, icon: Compass },
  { id: 'orders', href: '/app?view=orders', label: microcopy.nav.orders, icon: ShoppingBag },
  { id: 'profile', href: '/app/profile', label: microcopy.nav.profile, icon: User },
] as const

type TabId = (typeof TABS)[number]['id']

// La Home marca <html data-city-theme="night"> cuando la ciudad está de noche;
// la barra vive fuera de la Home y la acompaña leyendo ese dato.
function subscribeCityTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-city-theme'] })
  return () => observer.disconnect()
}
const readCityTheme = () => document.documentElement.dataset.cityTheme === 'night'

const DOCK = {
  day: {
    ink: '#2D2A4B',
    muted: '#98A2B3',
    active: 'rgba(45, 42, 75, 0.07)',
    background: 'rgba(255, 255, 255, 0.92)',
    border: '1px solid rgba(45, 42, 75, 0.08)',
    shadow: '0 10px 32px rgba(28, 26, 48, 0.16), 0 2px 6px rgba(28, 26, 48, 0.06)',
  },
  night: {
    ink: '#F4F2EF',
    muted: '#8D93A9',
    active: 'rgba(255, 255, 255, 0.1)',
    background: 'rgba(24, 26, 38, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    shadow: '0 10px 32px rgba(0, 0, 0, 0.5)',
  },
}

export default function BottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const haptic = useHaptic()
  const night = useSyncExternalStore(subscribeCityTheme, readCityTheme, () => false)
  const dock = night ? DOCK.night : DOCK.day

  const view = searchParams.get('view')
  const active: TabId | null = pathname.startsWith('/app/profile')
    ? 'profile'
    : pathname.startsWith('/app/orders')
      ? 'orders'
      : pathname === '/app'
        ? view === 'map'
          ? 'map'
          : view === 'list'
            ? 'explore'
            : view === 'orders'
              ? 'orders'
              : 'home'
        : null

  return (
    <nav
      className="fixed left-0 right-0 z-[1000] flex justify-center px-3 pointer-events-none"
      aria-label="Navegación principal"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <div
        className="pointer-events-auto flex items-stretch w-full max-w-[420px] h-16 p-1.5 rounded-[26px]"
        style={{
          backgroundColor: dock.background,
          WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
          backdropFilter: 'blur(20px) saturate(1.6)',
          border: dock.border,
          boxShadow: dock.shadow,
          transition: 'background-color 0.3s ease',
        }}
      >
        {TABS.map(tab => {
          const isActive = active === tab.id
          const Icon = tab.icon
          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => haptic.selection()}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex-1 flex flex-col items-center justify-center gap-[3px] rounded-[20px] transition-transform active:scale-95"
              style={{ color: isActive ? dock.ink : dock.muted }}
            >
              {isActive && (
                <motion.span
                  layoutId="tgo-nav-active"
                  className="absolute inset-0 rounded-[20px]"
                  style={{ backgroundColor: dock.active }}
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} className="relative" aria-hidden="true" />
              <span
                className="relative text-[10.5px] leading-none tracking-tight"
                style={{ fontWeight: isActive ? 700 : 600 }}
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
