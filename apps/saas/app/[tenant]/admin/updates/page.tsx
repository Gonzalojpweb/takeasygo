'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Bell, Sparkles, ArrowUpCircle, AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Announcement {
  _id: string
  title: string
  content: string
  type: 'feature' | 'update' | 'alert' | 'maintenance'
  publishedAt?: string
  createdAt: string
  read: boolean
}

const TYPE_STYLES = {
  feature: { icon: Sparkles, label: 'Nueva Función', lightBg: 'bg-indigo-50', lightText: 'text-indigo-700' },
  update: { icon: ArrowUpCircle, label: 'Actualización', lightBg: 'bg-blue-50', lightText: 'text-blue-700' },
  alert: { icon: AlertTriangle, label: 'Alerta', lightBg: 'bg-red-50', lightText: 'text-red-700' },
  maintenance: { icon: Wrench, label: 'Mantenimiento', lightBg: 'bg-amber-50', lightText: 'text-amber-700' },
} as const

export default function UpdatesPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const contentRef = useRef<HTMLDivElement>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string[]>([])

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return
    e.preventDefault()
    const path = href.startsWith('/') ? `/${tenantSlug}${href}` : `/${tenantSlug}/${href}`
    router.push(path)
  }, [tenantSlug, router])

  useEffect(() => {
    if (!tenantSlug) return
    fetch(`/api/${tenantSlug}/announcements?scope=all`)
      .then(r => r.json())
      .then(data => {
        if (data.announcements) setAnnouncements(data.announcements)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [tenantSlug])

  const markAsRead = async (ids: string[]) => {
    setMarking(prev => [...prev, ...ids])
    try {
      await fetch(`/api/${tenantSlug}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementIds: ids }),
      })
      setAnnouncements(prev => prev.map(a =>
        ids.includes(a._id) ? { ...a, read: true } : a
      ))
    } catch {}
    setMarking(prev => prev.filter(id => !ids.includes(id)))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground text-sm">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell size={24} className="text-primary" />
          Novedades del Sistema
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Comunicados y actualizaciones importantes de TakeasyGo
        </p>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-20">
          <Bell size={40} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground/60 text-sm">No hay novedades aún</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {announcements.map(ann => {
            const style = TYPE_STYLES[ann.type]
            const Icon = style.icon
            const date = ann.publishedAt || ann.createdAt

            return (
              <div
                key={ann._id}
                className="relative bg-card border border-border rounded-xl overflow-hidden transition-all hover:border-border/80"
              >
                {/* Unread indicator */}
                {!ann.read && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                )}

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Type badge */}
                      <div className={cn('shrink-0 px-2.5 py-1 rounded-md flex items-center gap-1.5', style.lightBg)}>
                        <Icon size={13} className={style.lightText} />
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider', style.lightText)}>
                          {style.label}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground text-sm truncate">
                            {ann.title}
                          </h3>
                          {!ann.read && (
                            <span className="shrink-0 w-2 h-2 rounded-full bg-primary animate-pulse" />
                          )}
                        </div>
                        <div
                          ref={contentRef}
                          onClick={handleContentClick}
                          className="mt-2 text-sm text-muted-foreground/80 leading-relaxed prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: ann.content }}
                        />
                      </div>
                    </div>

                    {/* Mark as read button */}
                    {!ann.read && (
                      <button
                        onClick={() => markAsRead([ann._id])}
                        disabled={marking.includes(ann._id)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 border border-primary/20 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        {marking.includes(ann._id) ? '...' : 'Leído'}
                      </button>
                    )}
                  </div>

                  {/* Date */}
                  <p className="mt-3 text-[11px] text-muted-foreground/50">
                    {format(new Date(date), "d 'de' MMMM, yyyy", { locale: es })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
