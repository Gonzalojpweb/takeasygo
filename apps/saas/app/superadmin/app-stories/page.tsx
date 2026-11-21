'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Smartphone, Eye, EyeOff, GripVertical, Play } from 'lucide-react'
import { toast } from 'sonner'
import { validateCtaLink, CTA_LINK_ERROR } from '@/lib/cta-link'
import AdsMediaUpload, { type AdsMediaValue } from '@/components/media/AdsMediaUpload'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface AppStory {
  _id: string
  title: string
  description: string
  shortDescription?: string
  imageUrl?: string
  videoUrl?: string
  videoPosterUrl?: string
  videoDurationMs?: number | null
  type: 'feature' | 'tutorial' | 'promotion' | 'announcement'
  ctaText?: string
  ctaLink?: string
  isActive: boolean
  sortOrder: number
  scheduledStart?: string
  scheduledEnd?: string
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
  owner?: { kind: 'platform' | 'tenant'; tenantId?: string | null; locationId?: string | null }
  surfaces?: string[]
  createdAt: string
}

// CP2 (20/11/2026): superficies donde se publica la story.
const SURFACE_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'menu_story', label: 'Stories del menú', hint: 'Círculo «TGO APP» en el menú de los comercios' },
  { value: 'app_story', label: 'Stories de la app', hint: 'Reservado: todavía no se muestra' },
  { value: 'home_banner', label: 'Banner del inicio', hint: 'Reservado: todavía no se muestra' },
]

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  feature: { label: 'Función', color: 'bg-blue-100 text-blue-700' },
  tutorial: { label: 'Tutorial', color: 'bg-green-100 text-green-700' },
  promotion: { label: 'Promo App', color: 'bg-purple-100 text-purple-700' },
  announcement: { label: 'Aviso', color: 'bg-amber-100 text-amber-700' },
}

export default function AppStoriesPage() {
  const [stories, setStories] = useState<AppStory[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoPosterUrl, setVideoPosterUrl] = useState('')
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null)
  const [showUrlFields, setShowUrlFields] = useState(false)
  // CP3: un archivo por story (imagen o video), subido a la cuenta ads.
  const mediaValue: AdsMediaValue | null = videoUrl
    ? { kind: 'video', url: videoUrl, posterUrl: videoPosterUrl || null, durationMs: videoDurationMs }
    : imageUrl ? { kind: 'image', url: imageUrl } : null
  const setMedia = (m: AdsMediaValue | null) => {
    setImageUrl(m?.kind === 'image' ? m.url : '')
    setVideoUrl(m?.kind === 'video' ? m.url : '')
    setVideoPosterUrl(m?.kind === 'video' ? m.posterUrl ?? '' : '')
    setVideoDurationMs(m?.kind === 'video' ? m.durationMs ?? null : null)
  }
  const [type, setType] = useState<string>('feature')
  const [ctaText, setCtaText] = useState('')
  const [ctaLink, setCtaLink] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [sortOrder, setSortOrder] = useState(0)
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [bgColor, setBgColor] = useState('')
  const [textColor, setTextColor] = useState('')
  const [accentColor, setAccentColor] = useState('')
  const [ownerKind, setOwnerKind] = useState<'platform' | 'tenant'>('platform')
  const [ownerTenantId, setOwnerTenantId] = useState('')
  const [ownerLocationId, setOwnerLocationId] = useState('')
  const [surfaces, setSurfaces] = useState<string[]>(['menu_story'])
  const [tenants, setTenants] = useState<Array<{ _id: string; name: string; slug: string }>>([])
  const [locations, setLocations] = useState<Array<{ _id: string; name: string }>>([])

  useEffect(() => {
    fetch('/api/superadmin/tenants')
      .then(r => r.ok ? r.json() : { tenants: [] })
      .then(d => setTenants((d.tenants || []).map((t: any) => ({ _id: String(t._id), name: t.name, slug: t.slug }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (ownerKind !== 'tenant' || !ownerTenantId) { setLocations([]); return }
    fetch(`/api/superadmin/tenants/${ownerTenantId}/locations`)
      .then(r => r.ok ? r.json() : { locations: [] })
      .then(d => setLocations(d.locations || []))
      .catch(() => setLocations([]))
  }, [ownerKind, ownerTenantId])

  useEffect(() => {
    fetchStories()
  }, [])

  async function fetchStories() {
    try {
      const res = await fetch('/api/superadmin/app-stories')
      const data = await res.json()
      if (res.ok) setStories(data.stories)
      else toast.error(data.error)
    } catch {
      toast.error('Error al cargar stories')
    } finally {
      setLoading(false)
    }
  }

  function openModal(story?: AppStory) {
    if (story) {
      setEditingId(story._id)
      setTitle(story.title)
      setDescription(story.description)
      setShortDescription(story.shortDescription || '')
      setImageUrl(story.imageUrl || '')
      setVideoUrl(story.videoUrl || '')
      setVideoPosterUrl(story.videoPosterUrl || '')
      setVideoDurationMs(story.videoDurationMs ?? null)
      setType(story.type)
      setCtaText(story.ctaText || '')
      setCtaLink(story.ctaLink || '')
      setIsActive(story.isActive)
      setSortOrder(story.sortOrder)
      setScheduledStart(story.scheduledStart ? story.scheduledStart.slice(0, 16) : '')
      setScheduledEnd(story.scheduledEnd ? story.scheduledEnd.slice(0, 16) : '')
      setBgColor(story.customStyles?.backgroundColor || '')
      setTextColor(story.customStyles?.textColor || '')
      setAccentColor(story.customStyles?.accentColor || '')
      // Stories viejas sin dueño ni superficies: plataforma + menú.
      setOwnerKind(story.owner?.kind === 'tenant' ? 'tenant' : 'platform')
      setOwnerTenantId(story.owner?.kind === 'tenant' && story.owner.tenantId ? String(story.owner.tenantId) : '')
      setOwnerLocationId(story.owner?.kind === 'tenant' && story.owner.locationId ? String(story.owner.locationId) : '')
      setSurfaces(story.surfaces?.length ? story.surfaces : ['menu_story'])
    } else {
      setEditingId(null)
      setTitle('')
      setDescription('')
      setShortDescription('')
      setImageUrl('')
      setVideoUrl('')
      setVideoPosterUrl('')
      setVideoDurationMs(null)
      setType('feature')
      setCtaText('')
      setCtaLink('')
      setIsActive(true)
      setSortOrder(0)
      setScheduledStart('')
      setScheduledEnd('')
      setBgColor('')
      setTextColor('')
      setAccentColor('')
      setOwnerKind('platform')
      setOwnerTenantId('')
      setOwnerLocationId('')
      setSurfaces(['menu_story'])
    }
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload: any = {
      title, description, shortDescription, imageUrl, videoUrl, videoPosterUrl, videoDurationMs,
      type, ctaText, ctaLink, isActive, sortOrder,
      scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
      customStyles: {
        backgroundColor: bgColor || undefined,
        textColor: textColor || undefined,
        accentColor: accentColor || undefined,
      },
      owner: ownerKind === 'tenant'
        ? { kind: 'tenant', tenantId: ownerTenantId, locationId: ownerLocationId || null }
        : { kind: 'platform' },
      surfaces,
    }
    if (ownerKind === 'tenant' && !ownerTenantId) {
      toast.error('Elegí el comercio dueño de la story')
      setSaving(false)
      return
    }
    if (surfaces.length === 0) {
      toast.error('Elegí al menos una superficie')
      setSaving(false)
      return
    }

    const url = editingId ? `/api/superadmin/app-stories/${editingId}` : '/api/superadmin/app-stories'
    const method = editingId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (Array.isArray(data?.warnings) && data.warnings.includes('ctaLink')) {
          toast.warning('El link guardado no es válido y no se muestra. Corregilo o borralo.')
        }
        toast.success(editingId ? 'Story actualizada' : 'Story creada')
        setIsModalOpen(false)
        fetchStories()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta story de la app?')) return
    try {
      const res = await fetch(`/api/superadmin/app-stories/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Story eliminada')
        setStories(prev => prev.filter(s => s._id !== id))
      } else {
        toast.error('Error al eliminar')
      }
    } catch {
      toast.error('Error de red')
    }
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      const res = await fetch(`/api/superadmin/app-stories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // El PUT reemplaza la story entera: se manda completa (antes solo
        // isActive + title, y activar/desactivar borraba el resto).
        body: JSON.stringify({ ...stories.find(s => s._id === id), isActive: !current }),
      })
      if (res.ok) {
        setStories(prev => prev.map(s => s._id === id ? { ...s, isActive: !current } : s))
        toast.success(current ? 'Story desactivada' : 'Story activada')
      }
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  if (loading) return <div className="p-8 text-center text-zinc-500">Cargando...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="text-zinc-400" />
            Stories de la App
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Contenido de marketing para promover el uso de TakeasyGo. Se muestra en todos los tenants.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="w-full sm:w-auto min-h-[44px] justify-center bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-800 transition flex items-center gap-2"
        >
          <Plus size={16} />
          Nueva Story
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {stories.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-zinc-500">No hay stories creadas. Creá la primera para promocionar la app.</div>
        ) : (
          <>
            {/* Mobile: tarjetas (20/11/2026: la tabla de 7 columnas se cortaba). */}
            <ul className="md:hidden divide-y divide-zinc-100">
              {stories.map(story => (
                <li key={story._id} className="p-4">
                  <div className="flex items-start gap-3">
                    {story.imageUrl ? (
                      <img src={story.imageUrl} alt="" className="w-14 h-20 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-20 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                        {story.videoUrl ? <Play size={16} className="text-zinc-400" /> : <span className="text-zinc-400 text-xs">IMG</span>}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900 break-words">{story.title}</p>
                      {story.description && <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2 break-words">{story.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider', TYPE_LABELS[story.type]?.color || 'bg-zinc-100 text-zinc-700')}>
                          {TYPE_LABELS[story.type]?.label || story.type}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {story.owner?.kind === 'tenant'
                            ? `Comercio: ${tenants.find(t => t._id === String(story.owner?.tenantId))?.name ?? '—'}`
                            : 'TakeasyGO'}
                        </span>
                        {story.videoUrl && <span className="text-[11px] text-zinc-500">· Video</span>}
                        {story.ctaText && <span className="text-[11px] text-zinc-500 break-all">· CTA: {story.ctaText}</span>}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-400">{format(new Date(story.createdAt), "d MMM, yyyy", { locale: es })}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(story._id, story.isActive)}
                      className={cn(
                        'flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-medium rounded-xl border transition',
                        story.isActive ? 'text-green-700 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'
                      )}
                    >
                      {story.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                      {story.isActive ? 'Activa' : 'Inactiva'}
                    </button>
                    <button onClick={() => openModal(story)} aria-label="Editar story" className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-600">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(story._id)} aria-label="Eliminar story" className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-zinc-200 text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desde tablet: tabla (con scroll horizontal si no entra). */}
            <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium w-8"></th>
                <th className="px-6 py-4 font-medium">Story</th>
                <th className="px-6 py-4 font-medium">Tipo</th>
                <th className="px-6 py-4 font-medium">Contenido</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {stories.map(story => (
                <tr key={story._id} className="hover:bg-zinc-50/50 transition">
                  <td className="px-6 py-4 text-zinc-300">
                    <GripVertical size={14} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {story.imageUrl ? (
                        <img src={story.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : story.videoUrl ? (
                        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                          <Play size={14} className="text-zinc-400" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0 text-zinc-400 text-xs">
                          IMG
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-zinc-900">{story.title}</span>
                        {story.description && (
                          <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1">{story.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn('px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider', TYPE_LABELS[story.type]?.color || 'bg-zinc-100 text-zinc-700')}>
                      {TYPE_LABELS[story.type]?.label || story.type}
                    </span>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {story.owner?.kind === 'tenant'
                        ? `Comercio: ${tenants.find(t => t._id === String(story.owner?.tenantId))?.name ?? '—'}`
                        : 'TakeasyGO'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {story.imageUrl && <span className="text-xs text-zinc-500">IMG</span>}
                      {story.videoUrl && <span className="text-xs text-zinc-500">VIDEO</span>}
                      {story.ctaText && <span className="text-xs text-zinc-500">CTA: {story.ctaText}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleActive(story._id, story.isActive)}
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition',
                        story.isActive ? 'text-green-600 hover:bg-green-50' : 'text-red-500 hover:bg-red-50'
                      )}
                    >
                      {story.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                      {story.isActive ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 whitespace-nowrap text-xs">
                    {format(new Date(story.createdAt), "d MMM, yyyy", { locale: es })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openModal(story)} className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(story._id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
          <div className="bg-white w-full sm:max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 sm:p-6 border-b border-zinc-100 flex justify-between items-center gap-3 shrink-0">
              <h2 className="text-lg sm:text-xl font-bold truncate">
                {editingId ? 'Editar story' : 'Nueva story'}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Cerrar" className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Título *</label>
                  <input required type="text" value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Ej: Descubrí TakeasyGo" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
                  <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Contenido de la story para educar al cliente sobre la app" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción corta</label>
                  <input type="text" value={shortDescription} onChange={e => setShortDescription(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Texto breve que aparece en el overlay" />
                </div>

                <div className="sm:col-span-2">
                  <AdsMediaUpload
                    endpointBase="/api/superadmin/media"
                    surface={surfaces.length === 1 && surfaces[0] === 'home_banner' ? 'home_banner' : 'story'}
                    value={mediaValue}
                    onChange={setMedia}
                    label="Imagen o video de la story"
                  />
                  <button type="button" onClick={() => setShowUrlFields(v => !v)} className="mt-2 text-xs text-zinc-500 underline">
                    {showUrlFields ? 'Ocultar URLs' : 'Pegar una URL a mano (avanzado)'}
                  </button>
                  {showUrlFields && (
                    <div className="mt-2 grid gap-2">
                      <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                        className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-base sm:text-sm" placeholder="URL de imagen (https://…)" />
                      <input type="text" value={videoUrl} onChange={e => { setVideoUrl(e.target.value); setVideoPosterUrl(''); setVideoDurationMs(null) }}
                        className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-base sm:text-sm" placeholder="URL de video MP4 (https://…)" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo</label>
                  <select value={type} onChange={e => setType(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400">
                    <option value="feature">Función de la app</option>
                    <option value="tutorial">Tutorial / Cómo usar</option>
                    <option value="promotion">Promo TakeasyGo</option>
                    <option value="announcement">Aviso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Orden</label>
                  <input type="number" min="0" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CTA Texto (botón)</label>
                  <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Ej: Descubrí más, Ver tutorial" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CTA Link</label>
                  <input type="text" value={ctaLink} onChange={e => setCtaLink(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="https://… o ruta interna /…" />
                  {ctaLink && !validateCtaLink(ctaLink).ok && (
                    <p className="mt-1 text-xs font-semibold text-red-600">{CTA_LINK_ERROR} Si es un link viejo, no se muestra hasta corregirlo.</p>
                  )}
                </div>

                <div className="sm:col-span-2 rounded-xl border border-zinc-200 p-4 space-y-3">
                  <p className="text-sm font-medium text-zinc-700">Dueño de la story</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="owner" checked={ownerKind === 'platform'} onChange={() => setOwnerKind('platform')} />
                      TakeasyGO (se ve en todos los menús)
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="owner" checked={ownerKind === 'tenant'} onChange={() => setOwnerKind('tenant')} />
                      Un comercio (solo en su menú)
                    </label>
                  </div>
                  {ownerKind === 'tenant' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select value={ownerTenantId} onChange={e => { setOwnerTenantId(e.target.value); setOwnerLocationId('') }}
                        className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-base sm:text-sm">
                        <option value="">Elegí el comercio…</option>
                        {tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                      </select>
                      <select value={ownerLocationId} onChange={e => setOwnerLocationId(e.target.value)} disabled={!ownerTenantId}
                        className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-base sm:text-sm disabled:opacity-50">
                        <option value="">Todas las sedes</option>
                        {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                  <p className="text-sm font-medium text-zinc-700 pt-1">Dónde se publica</p>
                  <div className="space-y-1.5">
                    {SURFACE_OPTIONS.map(o => (
                      <label key={o.value} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 rounded border-zinc-300" checked={surfaces.includes(o.value)}
                          onChange={e => setSurfaces(prev => e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value))} />
                        <span><span className="font-medium">{o.label}</span> <span className="text-xs text-zinc-500">· {o.hint}</span></span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                      className="rounded border-zinc-300" />
                    Activa
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Inicio programado</label>
                  <input type="datetime-local" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Fin programado</label>
                  <input type="datetime-local" value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="sm:col-span-2 border-t border-zinc-200 pt-4">
                  <p className="text-sm font-medium text-zinc-700 mb-3">Estilos personalizados (opcional)</p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Color de fondo</label>
                      <input type="color" value={bgColor || '#000000'} onChange={e => setBgColor(e.target.value)}
                        className="w-full h-10 rounded-lg border border-zinc-200 cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Color de texto</label>
                      <input type="color" value={textColor || '#ffffff'} onChange={e => setTextColor(e.target.value)}
                        className="w-full h-10 rounded-lg border border-zinc-200 cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Color de acento</label>
                      <input type="color" value={accentColor || '#6366f1'} onChange={e => setAccentColor(e.target.value)}
                        className="w-full h-10 rounded-lg border border-zinc-200 cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>
              </div>

              <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-t border-zinc-100 bg-white flex gap-3 sm:justify-end" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 sm:flex-none min-h-[44px] px-5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl border border-zinc-200 sm:border-0 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 sm:flex-none min-h-[44px] px-5 text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
