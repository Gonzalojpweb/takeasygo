'use client'

// ── GalleryManager ────────────────────────────────────────────────────────────
//
// Admin component for managing gallery images per location.
// Max 8 images, uses existing Cloudinary upload endpoint.

import { useCallback, useRef, useState } from 'react'
import { ImageIcon, Trash2, GripVertical, Loader2, Plus } from 'lucide-react'

interface GalleryManagerProps {
  tenantSlug: string
  locationId: string
  gallery: string[]
  onUpdate: (gallery: string[]) => void
  disabled?: boolean
}

export default function GalleryManager({
  tenantSlug,
  locationId,
  gallery,
  onUpdate,
  disabled = false,
}: GalleryManagerProps) {
  const [uploading, setUploading] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    if (gallery.length >= 8) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      const next = [...gallery, url].slice(0, 8)
      onUpdate(next)
    } catch {
      console.error('[GalleryManager] upload failed')
    } finally {
      setUploading(false)
    }
  }, [tenantSlug, gallery, onUpdate])

  const remove = useCallback((idx: number) => {
    const next = gallery.filter((_, i) => i !== idx)
    onUpdate(next)
  }, [gallery, onUpdate])

  const move = useCallback((from: number, to: number) => {
    if (from === to) return
    const next = [...gallery]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onUpdate(next)
  }, [gallery, onUpdate])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: 'var(--tgo-text-primary)' }}>
          Galería del local
        </span>
        <span className="text-xs" style={{ color: 'var(--tgo-text-muted)' }}>
          {gallery.length}/8 fotos
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {gallery.map((url, idx) => (
          <div
            key={`${locationId}-${idx}`}
            className="relative group rounded-xl overflow-hidden"
            style={{ aspectRatio: '1/1' }}
            draggable={!disabled}
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, idx)
              setDragIndex(null)
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
            {!disabled && (
              <>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                <button
                  onClick={() => remove(idx)}
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Trash2 size={12} color="#fff" />
                </button>
                <div
                  className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <GripVertical size={12} color="#fff" />
                </div>
              </>
            )}
          </div>
        ))}

        {gallery.length < 8 && !disabled && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center justify-center rounded-xl"
            style={{
              aspectRatio: '1/1',
              border: '2px dashed var(--tgo-border)',
              backgroundColor: 'var(--tgo-surface-1)',
              color: 'var(--tgo-text-muted)',
            }}
          >
            {uploading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                <Plus size={20} />
                <span style={{ fontSize: 10, marginTop: 4 }}>Agregar</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
