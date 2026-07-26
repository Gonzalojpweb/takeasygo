'use client'

import { X } from 'lucide-react'

interface SheetHeaderProps {
  name: string
  description?: string
  imageUrl?: string
  onClose: () => void
}

export default function SheetHeader({ name, description, imageUrl, onClose }: SheetHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderColor: 'rgba(0,0,0,0.06)',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-11 h-11 rounded-xl bg-zinc-100 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <h2 className="text-base font-bold text-zinc-900 truncate">{name}</h2>
        {description && (
          <p className="text-xs text-zinc-500 truncate">{description}</p>
        )}
      </div>

      <button
        onClick={onClose}
        className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 transition-colors flex-shrink-0"
      >
        <X size={18} className="text-zinc-600" />
      </button>
    </div>
  )
}
