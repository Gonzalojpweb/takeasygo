'use client'

import { useEffect, useState, use } from 'react'
import { Bell, CheckCircle2, AlertTriangle, Sparkles, Megaphone, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

interface Announcement {
  _id: string
  title: string
  content: string
  type: 'feature' | 'update' | 'alert' | 'maintenance'
  publishedAt: string
  createdAt: string
  readBy: string[]
}

const TYPE_CONFIG = {
  feature: { 
    icon: Sparkles, 
    color: 'text-indigo-600', 
    bg: 'bg-indigo-50 border-indigo-100',
    label: 'Nueva Función' 
  },
  update: { 
    icon: Megaphone, 
    color: 'text-blue-600', 
    bg: 'bg-blue-50 border-blue-100',
    label: 'Actualización' 
  },
  alert: { 
    icon: AlertTriangle, 
    color: 'text-red-600', 
    bg: 'bg-red-50 border-red-100',
    label: 'Alerta' 
  },
  maintenance: { 
    icon: Calendar, 
    color: 'text-amber-600', 
    bg: 'bg-amber-50 border-amber-100',
    label: 'Mantenimiento' 
  }
}

export default function UpdatesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params)
  const { data: session } = useSession()
  const userId = session?.user?.id

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAnnouncements() {
      try {
        const res = await fetch(`/api/${tenant}/announcements`)
        if (!res.ok) throw new Error('Error de red')
        const data = await res.json()
        
        const fetched = data.announcements || []
        setAnnouncements(fetched)

        // Mark unread as read
        if (userId) {
          const unreadIds = fetched
            .filter((a: Announcement) => !a.readBy.includes(userId))
            .map((a: Announcement) => a._id)

          if (unreadIds.length > 0) {
            await fetch(`/api/${tenant}/announcements`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ announcementIds: unreadIds })
            })
            // Update local state to avoid infinite loops or re-fetches
            setAnnouncements(prev => prev.map(a => 
              unreadIds.includes(a._id) ? { ...a, readBy: [...a.readBy, userId] } : a
            ))
          }
        }
      } catch (err) {
        toast.error('No se pudieron cargar las novedades')
      } finally {
        setLoading(false)
      }
    }

    fetchAnnouncements()
  }, [tenant, userId])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-3xl mx-auto">
        <div className="h-8 w-48 bg-zinc-200 rounded-lg mb-8"></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-40 bg-zinc-100 rounded-2xl"></div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-3">
          <Bell className="text-primary" />
          Novedades
        </h1>
        <p className="text-zinc-500 mt-2 text-lg leading-relaxed">
          Mantenete al día con las últimas actualizaciones, nuevas funciones y mejoras de la plataforma.
        </p>
      </div>

      {announcements.length === 0 ? (
        <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-12 text-center flex flex-col items-center">
          <CheckCircle2 size={48} className="text-zinc-300 mb-4" />
          <h3 className="text-xl font-bold text-zinc-800">Todo al día</h3>
          <p className="text-zinc-500 mt-2">No hay anuncios ni novedades por el momento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {announcements.map((ann) => {
            const config = TYPE_CONFIG[ann.type] || TYPE_CONFIG.update
            const Icon = config.icon
            const isUnread = userId && !ann.readBy.includes(userId)

            return (
              <div 
                key={ann._id} 
                className={`relative overflow-hidden border rounded-3xl p-6 md:p-8 transition-all ${
                  isUnread ? 'bg-white border-zinc-300 shadow-md ring-4 ring-primary/5' : 'bg-zinc-50 border-zinc-200 shadow-sm'
                }`}
              >
                {/* Decorative dot for unread */}
                {isUnread && (
                  <div className="absolute top-6 right-6 w-3 h-3 bg-primary rounded-full animate-pulse" />
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-xl border ${config.bg} ${config.color}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}>
                      {config.label}
                    </span>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {format(new Date(ann.publishedAt || ann.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  </div>
                </div>

                <h2 className="text-xl md:text-2xl font-black text-zinc-900 tracking-tight mb-4">
                  {ann.title}
                </h2>

                <div 
                  className="prose prose-zinc max-w-none prose-p:leading-relaxed prose-a:text-primary prose-a:font-semibold"
                  dangerouslySetInnerHTML={{ __html: ann.content }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
