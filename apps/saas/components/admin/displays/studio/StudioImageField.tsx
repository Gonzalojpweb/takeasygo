'use client'

// Campo de imagen de Display Studio con el modo híbrido de «quitar fondo»:
// 1) PNG ya recortado → se detecta solo («✓ Sin fondo»);
// 2) «Quitar fondo gratis» en el navegador (fondo liso), con antes/después;
// 3) «Quitar fondo HD» (Cloudinary) solo si está activado.
import { useRef, useState } from 'react'
import { Upload, Loader2, Wand2, Sparkles, X, Check, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { hasTransparency, loadImage, removeFlatBackground, uploadStudioImage } from './image-tools'

const ACCEPT = 'image/png,image/webp,image/jpeg'

export default function StudioImageField({ tenantSlug, label, hint, required, url, cutout, bgRemoval, onChange }: {
  tenantSlug: string
  label: string
  hint?: string
  required?: boolean
  url: string
  cutout: boolean
  bgRemoval: 'free' | 'cloudinary' | 'both'
  onChange: (url: string, cutout: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<null | 'subiendo' | 'quitando' | 'hd'>(null)
  const [progress, setProgress] = useState(0)
  const [candidate, setCandidate] = useState<{ blob: Blob; preview: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function pick(file: File) {
    setNote(null)
    if (!/^image\/(png|webp|jpeg)$/.test(file.type)) { toast.error('Usá una foto JPG, PNG o WebP'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('La foto pesa más de 10 MB'); return }
    setBusy('subiendo'); setProgress(0)
    const local = URL.createObjectURL(file)
    try {
      const img = await loadImage(local)
      const isCut = file.type !== 'image/jpeg' && hasTransparency(img)
      const { url: up } = await uploadStudioImage(tenantSlug, file, setProgress)
      onChange(up, isCut)
      if (!isCut) setNote('Esta foto tiene fondo. Para que el producto «flote» sobre el diseño, probá «Quitar fondo». Si no, se muestra enmarcada.')
    } catch (e) { toast.error((e as Error).message) } finally { URL.revokeObjectURL(local); setBusy(null); if (inputRef.current) inputRef.current.value = '' }
  }

  async function removeFree() {
    if (!url) return
    setBusy('quitando'); setNote(null)
    try {
      const img = await loadImage(url)
      const r = await removeFlatBackground(img)
      if (!r.ok) { setNote(r.reason); return }
      setCandidate({ blob: r.blob, preview: r.preview })
    } catch { setNote('No pudimos leer la foto para quitarle el fondo. Probá subirla de nuevo.') } finally { setBusy(null) }
  }

  async function acceptCandidate() {
    if (!candidate) return
    setBusy('subiendo'); setProgress(0)
    try {
      const { url: up } = await uploadStudioImage(tenantSlug, new File([candidate.blob], 'sin-fondo.png', { type: 'image/png' }), setProgress)
      onChange(up, true)
      toast.success('Listo: foto sin fondo')
      URL.revokeObjectURL(candidate.preview)
      setCandidate(null)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }

  async function removeHd() {
    if (!url) return
    setBusy('hd'); setNote(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/display-studio/remove-bg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const data = await res.json()
      if (!res.ok) { setNote(data.error || 'No se pudo quitar el fondo'); return }
      onChange(data.url, true)
      toast.success(`Fondo quitado en HD (${data.used} de ${data.cap} este mes). Puede tardar unos segundos en verse.`)
    } catch { setNote('No se pudo quitar el fondo') } finally { setBusy(null) }
  }

  const hd = bgRemoval !== 'free'
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</p>
        {url && (cutout
          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check size={12} aria-hidden /> Sin fondo</span>
          : <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">Con fondo · se enmarca</span>)}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border" style={{ backgroundImage: 'repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%)', backgroundSize: '12px 12px' }}>
          {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="text-muted-foreground" aria-hidden />}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => inputRef.current?.click()} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
            {busy === 'subiendo' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Upload size={16} aria-hidden />} {busy === 'subiendo' ? `Subiendo ${progress}%` : url ? 'Cambiar' : 'Subir foto'}
          </button>
          {url && !cutout && (
            <button type="button" disabled={!!busy} onClick={removeFree} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-primary px-3 text-sm font-semibold text-primary">
              {busy === 'quitando' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Wand2 size={16} aria-hidden />} Quitar fondo gratis
            </button>
          )}
          {url && !cutout && hd && (
            <button type="button" disabled={!!busy} onClick={removeHd} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
              {busy === 'hd' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />} Quitar fondo HD
            </button>
          )}
          {url && !required && (
            <button type="button" disabled={!!busy} onClick={() => onChange('', false)} className="min-h-[44px] inline-flex items-center gap-1 rounded-xl px-3 text-sm text-muted-foreground"><X size={14} aria-hidden /> Quitar</button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f) }} />
      {note && <p className="text-xs text-amber-700 dark:text-amber-400">{note}</p>}
      {candidate && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <p className="text-sm font-medium">¿Queda bien así?</p>
          <div className="grid grid-cols-2 gap-2">
            <figure className="space-y-1"><div className="aspect-square overflow-hidden rounded-lg border border-border bg-white"><img src={url} alt="" className="h-full w-full object-contain" /></div><figcaption className="text-center text-xs text-muted-foreground">Antes</figcaption></figure>
            <figure className="space-y-1"><div className="aspect-square overflow-hidden rounded-lg border border-border" style={{ backgroundImage: 'repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%)', backgroundSize: '12px 12px' }}><img src={candidate.preview} alt="" className="h-full w-full object-contain" /></div><figcaption className="text-center text-xs text-muted-foreground">Después</figcaption></figure>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={acceptCandidate} className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Usar sin fondo</button>
            <button type="button" disabled={!!busy} onClick={() => { URL.revokeObjectURL(candidate.preview); setCandidate(null) }} className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-semibold">Descartar (queda enmarcada)</button>
          </div>
        </div>
      )}
    </div>
  )
}
