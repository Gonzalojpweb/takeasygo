'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Home, Map, Compass, Utensils, User } from 'lucide-react'
import { motion } from 'framer-motion'

const TABS = [
  { id: 'home', href: '/explore', label: 'Inicio', icon: Home, isCenter: false },
  { id: 'map', href: '/explore?view=map', label: 'Mapa', icon: Map, isCenter: false },
  { id: 'explore', href: '/explore', label: 'Explorar', icon: Compass, isCenter: true },
  { id: 'rests', href: '/explore?view=list', label: 'Restós', icon: Utensils, isCenter: false },
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
    if (tab.id === 'rests') return currentView === 'list'
    if (tab.id === 'home' || tab.id === 'explore') return pathname === '/explore' && !currentView || currentView === 'home'
    return false
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1000] bg-white/95 backdrop-blur-xl border-t border-zinc-200/50 pb-[safe-area-inset-bottom] h-[calc(72px+env(safe-area-inset-bottom,0px))]">
      <div className="max-w-lg mx-auto h-16 flex items-center justify-around px-2 relative">
        
        {TABS.map((tab) => {
          const isActive = getActiveTab(tab)
          const Icon = tab.icon

          if (tab.isCenter) {
            return (
              <div key={tab.id} className="relative w-16 h-full flex flex-col items-center justify-center -top-4">
                <button
                  onClick={() => router.push(tab.href)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                    isActive 
                      ? 'bg-[#f74211] text-white scale-110 shadow-[#f74211]/40' 
                      : 'bg-zinc-900 text-white hover:bg-zinc-800'
                  }`}
                >
                  <Icon size={24} strokeWidth={2.5} />
                </button>
                <span className={`text-[10px] font-bold mt-1.5 transition-colors ${
                  isActive ? 'text-[#f74211]' : 'text-zinc-600'
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
              className="flex flex-col items-center justify-center gap-1 w-14 h-full transition-all active:scale-90"
            >
              <div className={`relative flex items-center justify-center transition-colors ${
                isActive ? 'text-[#f74211]' : 'text-zinc-400'
              }`}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-medium tracking-tight transition-colors ${
                isActive ? 'text-[#f74211]' : 'text-zinc-500'
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
