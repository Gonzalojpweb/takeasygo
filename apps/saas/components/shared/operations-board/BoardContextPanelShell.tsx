'use client'

import { type ReactNode } from 'react'
import { X } from 'lucide-react'

interface BoardContextPanelShellProps {
  /** Header title (e.g. order number, reservation ID) */
  headerTitle: string
  /** Header subtitle/badge */
  headerBadge?: ReactNode
  /** Main scrollable content */
  children: ReactNode
  /** Footer actions */
  footer?: ReactNode
  /** Close callback */
  onClose: () => void
}

export default function BoardContextPanelShell({
  headerTitle,
  headerBadge,
  children,
  footer,
  onClose,
}: BoardContextPanelShellProps) {
  return (
    <div className="w-full h-full bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-black text-base tracking-tight text-foreground truncate">
            {headerTitle}
          </h3>
          {headerBadge}
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {children}
      </div>

      {/* Footer actions */}
      {footer && (
        <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2">
          {footer}
        </div>
      )}
    </div>
  )
}
