'use client'

import { type ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'

interface BoardInsightsShellProps {
  /** Main scrollable content */
  children: ReactNode
}

export default function BoardInsightsShell({ children }: BoardInsightsShellProps) {
  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70">Insights</h3>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {children}
      </div>
    </div>
  )
}
