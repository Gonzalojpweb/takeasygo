'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, ImagePlus, Loader2, X } from 'lucide-react'
import { isPdfUrl } from '@/lib/menu-photos'

const MAX_PHOTOS = 6
const ACCEPT_TYPES =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,application/pdf,.pdf'

export default function MenuPhotosUploader({ tenant }: { tenant: string }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/${tenant}/onboarding/photos`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setPhotos(data.photos ?? [])
      } catch {
        // el estado se muestra vacío, no bloquea el paso
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenant])

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setBusy(true)
    setError('')

    try {
      let current = photos
      for (const file of Array.from(list)) {
        if (current.length >= MAX_PHOTOS) {
          setError(`Máximo ${MAX_PHOTOS} fotos de menú`)
          break
        }
        const form = new FormData()
        form.append('files', file)
        const res = await fetch(`/api/${tenant}/onboarding/photos`, {
          method: 'POST',
          body: form,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo')
        current = data.photos
        setPhotos(current)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removePhoto = async (url: string) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/onboarding/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el archivo')
      setPhotos(data.photos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el archivo')
    } finally {
      setBusy(false)
    }
  }

  const full = photos.length >= MAX_PHOTOS

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
      <div>
        <h2 className="text-lg font-medium">Carta del menú</h2>
        <p className="text-sm text-gray-500 mt-1">
          Subí fotos o el PDF de tu carta. Nuestro equipo los usa para armar tu menú.
          {busy ? '' : ` (${photos.length}/${MAX_PHOTOS})`}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {photos.map((url) => (
            <div key={url} className="relative group">
              {isPdfUrl(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-24 flex-col items-center justify-center gap-1 rounded-md border border-gray-200 bg-red-50 text-red-700 text-xs font-medium text-center px-2 hover:bg-red-100 transition-colors"
                >
                  <FileText size={20} />
                  <span className="line-clamp-2 break-all">PDF del menú</span>
                </a>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={url}
                  alt="Foto del menú"
                  className="w-full h-24 object-cover rounded-md border border-gray-200"
                />
              )}
              <button
                type="button"
                onClick={() => removePhoto(url)}
                disabled={busy}
                aria-label="Quitar archivo"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black text-white flex items-center justify-center opacity-0 group-hover:opacity-100 disabled:opacity-40 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!full && (
        <label
          className={`flex items-center justify-center gap-2 h-24 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
            busy ? 'opacity-50 cursor-wait' : 'border-gray-300 hover:border-black text-gray-500 hover:text-black'
          }`}
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : <ImagePlus size={18} />}
          <span className="text-sm font-medium">
            {busy ? 'Subiendo…' : 'Agregar fotos o PDF del menú'}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_TYPES}
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      )}
    </div>
  )
}
