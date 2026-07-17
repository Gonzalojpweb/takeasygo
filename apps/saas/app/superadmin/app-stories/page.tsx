'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Smartphone, Eye, EyeOff, GripVertical, Play } from 'lucide-react'
import { toast } from 'sonner'
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
  createdAt: string
}

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
    } else {
      setEditingId(null)
      setTitle('')
      setDescription('')
      setShortDescription('')
      setImageUrl('')
      setVideoUrl('')
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
    }
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload: any = {
      title, description, shortDescription, imageUrl, videoUrl,
      type, ctaText, ctaLink, isActive, sortOrder,
      scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
      customStyles: {
        backgroundColor: bgColor || undefined,
        textColor: textColor || undefined,
        accentColor: accentColor || undefined,
      },
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
        body: JSON.stringify({ isActive: !current, title: stories.find(s => s._id === id)?.title }),
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
          className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-800 transition flex items-center gap-2"
        >
          <Plus size={16} />
          Nueva Story
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {stories.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">No hay stories creadas. Creá la primera para promocionar la app.</div>
        ) : (
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
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold">
                {editingId ? 'Editar Story de la App' : 'Crear Story de la App'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Título *</label>
                  <input required type="text" value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Ej: Descubrí TakeasyGo" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
                  <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Contenido de la story para educar al cliente sobre la app" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción corta</label>
                  <input type="text" value={shortDescription} onChange={e => setShortDescription(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Texto breve que aparece en el overlay" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">URL de imagen</label>
                  <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="https://... (imagen de fondo de la story)" />
                  {imageUrl && (
                    <div className="mt-2 relative w-32 h-56 rounded-xl overflow-hidden border border-zinc-200">
                      <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">URL de video (opcional)</label>
                  <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="https://... (mp4, se reproduce como fondo)" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo</label>
                  <select value={type} onChange={e => setType(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400">
                    <option value="feature">Función de la app</option>
                    <option value="tutorial">Tutorial / Cómo usar</option>
                    <option value="promotion">Promo TakeasyGo</option>
                    <option value="announcement">Aviso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Orden</label>
                  <input type="number" min="0" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CTA Texto (botón)</label>
                  <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="Ej: Descubrí más, Ver tutorial" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CTA Link</label>
                  <input type="text" value={ctaLink} onChange={e => setCtaLink(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                    placeholder="https://takeasygo.app o URL externa" />
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
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Fin programado</label>
                  <input type="datetime-local" value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2 border-t border-zinc-200 pt-4">
                  <p className="text-sm font-medium text-zinc-700 mb-3">Estilos personalizados (opcional)</p>
                  <div className="grid grid-cols-3 gap-4">
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

              <div className="pt-4 border-t border-zinc-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition disabled:opacity-50">
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
