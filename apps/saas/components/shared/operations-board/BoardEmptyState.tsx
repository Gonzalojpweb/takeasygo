'use client'

import { type ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface BoardEmptyStateProps {
  icon?: ReactNode
  title?: string
  description?: string
}

export default function BoardEmptyState({
  icon,
  title = 'Sin items',
  description = 'No hay items para mostrar.',
}: BoardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
        {icon || <Inbox className="text-muted-foreground" size={22} />}
      </div>
      <p className="font-bold text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
    </div>
  )
}
