'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, ArrowUpCircle, AlertTriangle, Wrench, ChevronRight } from 'lucide-react'

interface Announcement {
  _id: string
  title: string
  type: 'feature' | 'update' | 'alert' | 'maintenance'
}

const TYPE_STYLES = {
  feature: { icon: Sparkles, accent: '#818cf8' },
  update: { icon: ArrowUpCircle, accent: '#60a5fa' },
  alert: { icon: AlertTriangle, accent: '#f87171' },
  maintenance: { icon: Wrench, accent: '#fbbf24' },
} as const

interface Props {
  tenantSlug: string
}

export function SystemAnnouncementBanner({ tenantSlug }: Props) {
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!tenantSlug) { setLoading(false); return }
    let cancelled = false
    fetch(`/api/${tenantSlug}/announcements`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.announcements?.length > 0) {
          setAnnouncements(data.announcements)
        }
        if (!cancelled) setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tenantSlug])

  const markAsRead = useCallback(async (ids: string[]) => {
    try {
      await fetch(`/api/${tenantSlug}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementIds: ids }),
      })
    } catch {}
  }, [tenantSlug])

  const handleDismiss = useCallback(() => {
    if (announcements.length === 0) return
    markAsRead(announcements.map(a => a._id))
    setDismissed(true)
  }, [announcements, markAsRead])

  if (loading || dismissed || announcements.length === 0) return null

  const latestType = announcements[announcements.length - 1].type
  const style = TYPE_STYLES[latestType]
  const Icon = style.icon
  const count = announcements.length

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 24, stiffness: 320 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[92vw] max-w-[420px]"
        style={{ pointerEvents: 'auto' }}
      >
        <div
          style={{
            background: 'linear-gradient(160deg, #1e1b19 0%, #161310 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 18,
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: `linear-gradient(90deg, ${style.accent} 60%, transparent)`, borderRadius: '18px 18px 0 0' }}
          />

          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    background: `${style.accent}15`,
                    border: `1px solid ${style.accent}30`,
                  }}
                >
                  <Icon size={17} style={{ color: style.accent }} />
                </div>

                <div className="min-w-0">
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f7f4f2', letterSpacing: '-0.01em' }}>
                    Novedades del sistema
                  </span>
                  <span
                    className="ml-2 inline-flex items-center justify-center"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#f7f4f2',
                      background: style.accent,
                      borderRadius: 99,
                      padding: '1px 6px',
                      minWidth: 18,
                      height: 18,
                      verticalAlign: 'middle',
                    }}
                  >
                    {count}
                  </span>
                </div>
              </div>

              <button
                onClick={handleDismiss}
                className="shrink-0 flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                }}
              >
                <X size={12} style={{ color: '#6e6560' }} />
              </button>
            </div>

            <p className="mt-2.5 ml-[48px]" style={{ fontSize: 12.5, color: '#8a7f7a', lineHeight: 1.5 }}>
              {count === 1
                ? 'Hay una novedad nueva desde tu último ingreso.'
                : `Tenés ${count} novedades nuevas desde tu último ingreso.`}
            </p>

            <div className="mt-3 ml-[48px]">
              <button
                onClick={() => { handleDismiss(); router.push(`/${tenantSlug}/admin/updates`) }}
                className="inline-flex items-center gap-1 transition-all active:scale-95"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: style.accent,
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                Ver novedades
                <ChevronRight size={13} style={{ color: style.accent }} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
