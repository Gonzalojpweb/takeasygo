'use client'

import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

interface StatusNotificationCardProps {
  icon: string
  iconBg: string
  title: string
  description: string
}

export function StatusNotificationCard({ icon, iconBg, title, description }: StatusNotificationCardProps) {
  const [timeLabel, setTimeLabel] = useState('ahora')

  useEffect(() => {
    const timer = setTimeout(() => setTimeLabel('justo ahora'), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <figure
      className={cn(
        'relative mx-auto w-full cursor-default overflow-hidden rounded-2xl p-4',
        'transition-all duration-200',
        'bg-white shadow-[0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)]',
        'dark:bg-zinc-900/95 dark:shadow-[0_-20px_80px_-20px_#ffffff1f_inset] dark:backdrop-blur-md dark:border dark:border-white/10'
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-row items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-2xl shrink-0"
          style={{ backgroundColor: iconBg }}
          aria-hidden="true"
        >
          <span className="text-lg leading-none">{icon}</span>
        </div>
        <div className="flex flex-col overflow-hidden min-w-0">
          <figcaption className="flex flex-row items-center text-sm sm:text-base font-semibold whitespace-pre text-zinc-900 dark:text-white">
            <span className="truncate">{title}</span>
            <span className="mx-1.5 shrink-0 text-zinc-400 dark:text-zinc-500">·</span>
            <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 shrink-0">{timeLabel}</span>
          </figcaption>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-tight mt-0.5">
            {description}
          </p>
        </div>
      </div>
    </figure>
  )
}
