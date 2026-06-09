'use client'

import type { ReactNode } from 'react'

interface PromoHeaderProps {
  badgeLabel?: string
  title: string
}

export function PromoHeader({ badgeLabel, title }: PromoHeaderProps) {
  return (
    <div className="bg-primary rounded-t-2xl sm:rounded-t-2xl px-6 pt-6 pb-8 text-center relative overflow-hidden">
      <div className="flex items-center justify-center gap-3 my-5">
        <div className="size-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img src="/tgoicon-192.png" alt="TakeAsyGo" className="size-8 object-contain" />
        </div>
        <span className="text-[12px] font-black tracking-[0.12em] text-primary-foreground/80 uppercase">
          TakeAsyGo
        </span>
      </div>

      {badgeLabel && (
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground/60 mb-2">
          {badgeLabel}
        </p>
      )}

      <h3 className="text-xl sm:text-2xl font-black text-primary-foreground leading-tight tracking-tight min-w-[90%] mx-auto">
        {renderTitle(title)}
      </h3>
    </div>
  )
}

function renderTitle(title: string): ReactNode {
  if (!title) return ''
  const dotIndex = title.indexOf('.')
  if (dotIndex > 0 && dotIndex < title.length - 1) {
    const first = title.substring(0, dotIndex + 1)
    const second = title.substring(dotIndex + 1)
    return (
      <>
        {first}
        <br />
        <span className="text-primary-foreground/90">{second.trim()}</span>
      </>
    )
  }
  const matchWord = ' y ganá '
  const matchIndex = title.toLowerCase().indexOf(matchWord)
  if (matchIndex > 0) {
    const first = title.substring(0, matchIndex)
    const second = title.substring(matchIndex)
    return (
      <>
        {first}
        <br />
        <span className="text-primary-foreground/90">{second.trim()}</span>
      </>
    )
  }
  return title
}
