'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, ArrowUpCircle, AlertTriangle, Wrench } from 'lucide-react'

interface Announcement {
  _id: string
  title: string
  content: string
  type: 'feature' | 'update' | 'alert' | 'maintenance'
}

const TYPE_STYLES = {
  feature: {
    icon: Sparkles,
    label: 'Nueva Función',
    iconBg: 'rgba(99,102,241,0.1)',
    iconBorder: 'rgba(99,102,241,0.25)',
    iconColor: '#818cf8',
    glow: 'rgba(99,102,241,0.12)',
    accent: '#818cf8',
  },
  update: {
    icon: ArrowUpCircle,
    label: 'Actualización',
    iconBg: 'rgba(59,130,246,0.1)',
    iconBorder: 'rgba(59,130,246,0.25)',
    iconColor: '#60a5fa',
    glow: 'rgba(59,130,246,0.12)',
    accent: '#60a5fa',
  },
  alert: {
    icon: AlertTriangle,
    label: 'Alerta',
    iconBg: 'rgba(239,68,68,0.1)',
    iconBorder: 'rgba(239,68,68,0.25)',
    iconColor: '#f87171',
    glow: 'rgba(239,68,68,0.12)',
    accent: '#f87171',
  },
  maintenance: {
    icon: Wrench,
    label: 'Mantenimiento',
    iconBg: 'rgba(245,158,11,0.1)',
    iconBorder: 'rgba(245,158,11,0.25)',
    iconColor: '#fbbf24',
    glow: 'rgba(245,158,11,0.12)',
    accent: '#fbbf24',
  },
} as const

interface Props {
  tenantSlug: string
}

export function SystemAnnouncementBanner({ tenantSlug }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!tenantSlug) {
      setLoading(false)
      return
    }
    fetch(`/api/${tenantSlug}/announcements`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          if (data.announcements?.length > 0) {
            setAnnouncements(data.announcements)
          }
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
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

  const handleNext = useCallback(() => {
    if (currentIndex < announcements.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      handleDismiss()
    }
  }, [currentIndex, announcements.length, handleDismiss])

  if (loading || dismissed || announcements.length === 0) return null

  const announcement = announcements[currentIndex]
  const style = TYPE_STYLES[announcement.type]
  const Icon = style.icon
  const isLast = currentIndex === announcements.length - 1

  return (
    <AnimatePresence>
      <motion.div
        key="sa-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[120] flex items-center justify-center p-5"
        style={{
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <motion.div
          key={announcement._id}
          initial={{ scale: 0.92, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 360 }}
          className="w-full max-w-[400px] relative overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #1e1b19 0%, #161310 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 24,
            boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: `linear-gradient(90deg, ${style.accent} 60%, transparent)` }}
          />

          <div className="p-7">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="shrink-0"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: style.iconBg,
                    border: `1px solid ${style.iconBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 20px ${style.glow}`,
                  }}
                >
                  <Icon size={22} style={{ color: style.iconColor }} />
                </div>

                <div className="min-w-0">
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: style.accent,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {style.label}
                  </span>
                  <h3
                    className="truncate"
                    style={{
                      fontWeight: 800,
                      fontSize: 17,
                      color: '#f7f4f2',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.2,
                      marginTop: 2,
                    }}
                  >
                    {announcement.title}
                  </h3>
                </div>
              </div>

              <button
                onClick={handleDismiss}
                className="shrink-0 flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                }}
              >
                <X size={14} style={{ color: '#8a7f7a' }} />
              </button>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 20 }} />

            <div
              className="text-sm leading-relaxed"
              style={{ color: '#c4bbb6' }}
              dangerouslySetInnerHTML={{ __html: announcement.content }}
            />

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginTop: 20, marginBottom: 20 }} />

            <div className="flex items-center justify-between gap-3">
              {announcements.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {announcements.map((_, i) => (
                    <div
                      key={i}
                      className="transition-all duration-300"
                      style={{
                        width: i === currentIndex ? 20 : 6,
                        height: 6,
                        borderRadius: 99,
                        background: i === currentIndex ? style.accent : 'rgba(255,255,255,0.1)',
                      }}
                    />
                  ))}
                </div>
              )}

              {announcements.length <= 1 && <div />}

              <motion.button
                onClick={handleNext}
                whileHover={{
                  background: 'linear-gradient(135deg, #e83d1c 0%, #d13518 100%)',
                  boxShadow: '0 4px 20px rgba(241,71,34,0.4)',
                }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '11px 24px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #f14722 0%, #e03c1a 100%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(241,71,34,0.3)',
                }}
              >
                {isLast ? 'Entendido' : 'Siguiente'}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
