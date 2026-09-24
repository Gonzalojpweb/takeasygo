'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, PlayCircle, Sparkles, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ContextualLessonProps {
  /** Identificador estable de la feature/lección */
  featureId: string
  title: string
  description: string
  /** Embed de YouTube/Vimeo (30-60 seg), opcional */
  videoUrl?: string
  /** Clave de localStorage para no volver a mostrar. Default: `lesson_seen_${featureId}` */
  dismissKey?: string
  ctaLabel?: string
  ctaHref?: string
  className?: string
}

function storageKey(dismissKey: string | undefined, featureId: string): string {
  return dismissKey ?? `lesson_seen_${featureId}`
}

function hasSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return true // sin localStorage → no molestar
  }
}

function markSeen(key: string): void {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // best-effort
  }
}

/**
 * ContextualLesson — mini-banner inline que se muestra una sola vez
 * cuando el admin entra por primera vez a una sección.
 *
 * El estado de "ya visto" se persiste en localStorage (dismissKey).
 */
export default function ContextualLesson({
  featureId,
  title,
  description,
  videoUrl,
  dismissKey,
  ctaLabel,
  ctaHref,
  className,
}: ContextualLessonProps) {
  const key = storageKey(dismissKey, featureId)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // localStorage is client-only; defer to effect to avoid hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(!hasSeen(key))
  }, [key])

  if (!visible) return null

  const dismiss = () => {
    markSeen(key)
    setVisible(false)
  }

  const body = (
    <div className="relative flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3.5 pr-9">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dismiss()
        }}
        aria-label="Cerrar lección"
        className="absolute top-2 right-2 p-1 rounded-md text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <X size={14} />
      </button>

      <div className="shrink-0 mt-0.5">
        {videoUrl ? (
          <PlayCircle size={18} className="text-amber-600" />
        ) : (
          <Sparkles size={18} className="text-amber-600" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-900 leading-snug">{title}</p>
        <p className="text-xs text-amber-800/75 mt-0.5 leading-relaxed">{description}</p>

        <div className="flex flex-wrap items-center gap-3 mt-2">
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <PlayCircle size={12} />
              Ver video (1 min)
            </a>
          )}
          {ctaLabel && ctaHref && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-700 group-hover:underline">
              {ctaLabel}
              <ChevronRight size={11} className="mt-px" />
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (ctaLabel && ctaHref) {
    return (
      <Link href={ctaHref} className={cn('block mb-4', className)} onClick={dismiss}>
        {body}
      </Link>
    )
  }

  return <div className={cn('mb-4', className)}>{body}</div>
}
