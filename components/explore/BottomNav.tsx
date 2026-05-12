'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Home, Map, Compass, ShoppingBag, User } from 'lucide-react'
import { motion } from 'framer-motion'

const TABS = [
  { id: 'home', href: '/explore', label: 'Inicio', icon: Home, isCenter: false },
  { id: 'map', href: '/explore?view=map', label: 'Mapa', icon: Map, isCenter: false },
  { id: 'explore', href: '/explore?view=list', label: 'Explorar', icon: Compass, isCenter: true },
  { id: 'orders', href: '/explore?view=orders', label: 'Pedidos', icon: ShoppingBag, isCenter: false },
  { id: 'profile', href: '/explore/profile', label: 'Perfil', icon: User, isCenter: false },
] as const

export default function BottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const currentView = searchParams.get('view') || 'home'

  const getActiveTab = (tab: typeof TABS[number]) => {
    if (tab.id === 'profile') return pathname === '/explore/profile'
    if (tab.id === 'map') return currentView === 'map'
    if (tab.id === 'explore') return currentView === 'list'
    if (tab.id === 'orders') return currentView === 'orders'
    if (tab.id === 'home') return pathname === '/explore' && (!searchParams.get('view') || currentView === 'home')
    return false
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1000] bg-[#fafafa]/95 backdrop-blur-xl border-t border-zinc-200/50 pb-[safe-area-inset-bottom] h-[calc(64px+env(safe-area-inset-bottom,0px))]">
      <div className="max-w-lg mx-auto h-14 flex items-center justify-around px-2 relative">
        
        {TABS.map((tab) => {
          const isActive = getActiveTab(tab)
          const Icon = tab.icon

          if (tab.isCenter) {
            return (
              <div key={tab.id} className="relative w-16 h-full flex flex-col items-center justify-center -top-3">
                <button
                  onClick={() => router.push(tab.href)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                    isActive 
                      ? 'bg-[#f54500] text-white scale-110 shadow-[#f54500]/40' 
                      : 'bg-zinc-900 text-white hover:bg-zinc-800'
                  }`}
                >
                  <Icon size={20} strokeWidth={isActive ? 3 : 2} />
                </button>
                <span className={`text-[9px] font-black uppercase mt-1 transition-colors ${
                  isActive ? 'text-[#f54500]' : 'text-zinc-500'
                }`}>
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
              <div className={`relative flex items-center justify-center transition-colors ${
                isActive ? 'text-[#f54500]' : 'text-zinc-400'
              }`}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[9px] font-bold tracking-tight transition-colors ${
                isActive ? 'text-[#f54500]' : 'text-zinc-400'
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
