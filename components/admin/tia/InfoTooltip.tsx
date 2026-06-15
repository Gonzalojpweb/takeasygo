'use client'

import { useState } from 'react'

interface Props {
  text: string
}

export default function InfoTooltip({ text }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-200 text-zinc-500 text-[10px] font-bold hover:bg-zinc-300 transition-colors flex-shrink-0"
      >
        ?
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 rounded-lg bg-zinc-900 text-white text-[11px] leading-relaxed shadow-lg z-50 pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
        </div>
      )}
    </span>
  )
}
