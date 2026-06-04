'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/superadmin/analytics', label: 'TakeasyGO' },
  { href: '/superadmin/analytics/tgo', label: 'TGO App' },
]

export default function AnalyticsTabBar() {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/40 w-fit">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all duration-200',
              isActive
                ? 'bg-background text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
