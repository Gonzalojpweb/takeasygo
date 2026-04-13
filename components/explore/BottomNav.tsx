'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Compass, Map, Heart, User } from 'lucide-react'

const TABS = [
  { href: '/explore', label: 'Explorar', icon: Compass },
  { href: '/explore?view=map', label: 'Mapa', icon: Map },
  { href: '/explore?tab=favs', label: 'Favoritos', icon: Heart },
  { href: '/explore/profile', label: 'Perfil', icon: User },
] as const

export default function BottomNav({ activeView }: { activeView?: string }) {
  const pathname = usePathname()

  // Determine which tab is active
  const getActiveTab = (href: string) => {
    if (activeView === 'map' && href.includes('view=map')) return true
    if (activeView === 'favs' && href.includes('tab=favs')) return true
    if (pathname === '/explore/profile' && href === '/explore/profile') return true
    if (!activeView && pathname === '/explore' && href === '/explore') return true
    return false
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom"
      style={{ background: 'rgba(13,11,10,0.82)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
    >
      <div className="flex items-center justify-around max-w-lg mx-auto px-2 pt-2 pb-1">
        {TABS.map(tab => {
          const isActive = getActiveTab(tab.href)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-200 cursor-pointer group"
            >
              <div className={`relative flex items-center justify-center w-10 h-8 rounded-full transition-all duration-300 ${
                isActive
                  ? 'bg-[#f14722]/15'
                  : 'group-hover:bg-white/5'
              }`}>
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.2 : 1.5}
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-[#f14722]' : 'text-[#5a524d] group-hover:text-[#8a7f7a]'
                  }`}
                />
                {isActive && (
                  <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[#f14722]" />
                )}
              </div>
              <span className={`text-[9px] font-semibold tracking-wide uppercase transition-colors duration-200 ${
                isActive ? 'text-[#f14722]' : 'text-[#5a524d] group-hover:text-[#8a7f7a]'
              }`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
