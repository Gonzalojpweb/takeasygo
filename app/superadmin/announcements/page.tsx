'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Megaphone, CheckCircle2, Clock, Info, Users } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Announcement {
  _id: string
  title: string
  content: string
  type: 'feature' | 'update' | 'alert' | 'maintenance'
  status: 'draft' | 'published'
  publishedAt?: string
  targetPlans: string[]
  readBy: string[]
  createdAt: string
}

const TYPE_LABELS = {
  feature: { label: 'Nueva Función', color: 'bg-indigo-100 text-indigo-700' },
  update: { label: 'Actualización', color: 'bg-blue-100 text-blue-700' },
  alert: { label: 'Alerta', color: 'bg-red-100 text-red-700' },
  maintenance: { label: 'Mantenimiento', color: 'bg-amber-100 text-amber-700' }
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<Announcement['type']>('update')
  const [status, setStatus] = useState<Announcement['status']>('draft')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  async function fetchAnnouncements() {
    try {
      const res = await fetch('/api/superadmin/announcements')
      const data = await res.json()
      if (res.ok) {
        setAnnouncements(data.announcements)
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      toast.error('Error al cargar anuncios')
    } finally {
      setLoading(false)
    }
  }

  function openModal(ann?: Announcement) {
    if (ann) {
      setEditingId(ann._id)
      setTitle(ann.title)
      setContent(ann.content)
      setType(ann.type)
      setStatus(ann.status)
    } else {
      setEditingId(null)
      setTitle('')
      setContent('')
      setType('update')
      setStatus('draft')
    }
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload = { title, content, type, status, targetPlans: [] }
    const url = editingId ? `/api/superadmin/announcements/${editingId}` : '/api/superadmin/announcements'
    const method = editingId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(editingId ? 'Anuncio actualizado' : 'Anuncio creado')
        setIsModalOpen(false)
        fetchAnnouncements()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de eliminar este anuncio?')) return

    try {
      const res = await fetch(`/api/superadmin/announcements/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Anuncio eliminado')
        setAnnouncements(prev => prev.filter(a => a._id !== id))
      } else {
        toast.error('Error al eliminar')
      }
    } catch (err) {
      toast.error('Error de red')
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="text-zinc-400" />
            Novedades del Sistema
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Gestiona los comunicados y "Release Notes" que verán los restaurantes.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-800 transition flex items-center gap-2"
        >
          <Plus size={16} />
          Nuevo Anuncio
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {announcements.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            No hay anuncios creados.
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium">Anuncio</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium">Lecturas</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {announcements.map(ann => (
                <tr key={ann._id} className="hover:bg-zinc-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn('px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider', TYPE_LABELS[ann.type].color)}>
                        {TYPE_LABELS[ann.type].label}
                      </span>
                      <span className="font-medium text-zinc-900">{ann.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {ann.status === 'published' ? (
                      <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                        <CheckCircle2 size={14} /> Publicado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
                        <Clock size={14} /> Borrador
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <Users size={14} /> {ann.readBy?.length || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                    {format(new Date(ann.createdAt), "d MMM, yyyy", { locale: es })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openModal(ann)} className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(ann._id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
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
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold">
                {editingId ? 'Editar Anuncio' : 'Crear Nuevo Anuncio'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Título</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                  placeholder="Ej: Nuevas métricas en Dashboard"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo de Anuncio</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as Announcement['type'])}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                  >
                    <option value="feature">Nueva Función</option>
                    <option value="update">Actualización General</option>
                    <option value="alert">Alerta / Aviso</option>
                    <option value="maintenance">Mantenimiento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Estado</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as Announcement['status'])}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
                  >
                    <option value="draft">Borrador (Oculto)</option>
                    <option value="published">Publicado (Visible)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Contenido (HTML permitido)
                </label>
                <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-lg mb-2 flex gap-2">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <p>Puedes usar etiquetas HTML básicas como &lt;b&gt;, &lt;ul&gt;, &lt;li&gt;, o enlaces &lt;a href="..."&gt; para darle formato al texto.</p>
                </div>
                <textarea
                  required
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={8}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400 font-mono"
                  placeholder="<p>Estamos emocionados de anunciar...</p>"
                />
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Anuncio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
