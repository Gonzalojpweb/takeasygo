'use client'

import { useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { safeCtaHref } from '@/lib/cta-link'
import { trackPlacement, trackPlacementOnce, type Placement } from '@/lib/placement-track'
import { markStorySeen } from '@/lib/story-seen'
import { useStoryPlayer } from './useStoryPlayer'

export interface AppStoryItem {
  _id: string
  title: string
  description?: string
  shortDescription?: string
  imageUrl?: string
  videoUrl?: string
  ctaText?: string
  ctaLink?: string
  type?: string
  updatedAt?: string
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
}

interface Props {
  stories: AppStoryItem[]
  onClose: () => void
  primaryColor?: string
  /** Métricas (20/11/2026): superficie y contexto donde se abre el visor. */
  placement?: Placement
  tenantSlug?: string
  locationId?: string
  /** Pieza con la que abre (la primera sin ver). */
  initialIndex?: number
}

const DURATION = 7000

export default function AppStoryViewer({ stories, onClose, primaryColor = '#6366f1', placement = 'menu_story', tenantSlug, locationId, initialIndex = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const ctx = { placement, kind: 'app_story' as const, tenantSlug, locationId }

  const { index: currentIndex, progress, paused, goTo, close, handlers } = useStoryPlayer({
    count: stories.length,
    durationMs: DURATION,
    initialIndex,
    onClose,
    // Vista = 1 s en pantalla: cuenta para métricas y marca «visto» (solo en este navegador).
    onView: (i) => {
      const s = stories[i]
      if (!s) return
      markStorySeen(s._id)
      trackPlacementOnce({ ...ctx, type: 'story_view', pieceId: s._id })
    },
    onComplete: (i) => { if (stories[i]) trackPlacementOnce({ ...ctx, type: 'story_complete', pieceId: stories[i]._id }) },
    onExit: (reason, i) => { if (stories[i]) trackPlacement({ ...ctx, type: 'exit', pieceId: stories[i]._id, reason, index: i }) },
  })

  useEffect(() => {
    if (videoRef.current) {
      if (paused) videoRef.current.pause()
      else videoRef.current.play().catch(() => {})
    }
  }, [paused, currentIndex])

  if (stories.length === 0) return null

  const story = stories[currentIndex]
  const bgColor = story.customStyles?.backgroundColor || '#000'
  const txtColor = story.customStyles?.textColor || '#fff'
  const accent = story.customStyles?.accentColor || primaryColor
  // Link inválido (incluidos los viejos guardados) → sin CTA.
  const cta = story.ctaText ? safeCtaHref(story.ctaLink) : null
  const hasCta = !!cta

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Progress bars */}
      <div className="flex gap-1 px-2 pt-3 pb-2 z-10">
        {stories.map((s, i) => (
          <div key={s._id} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                backgroundColor: 'white',
                width: i < currentIndex ? '100%' : i === currentIndex ? `${progress * 100}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={() => close('close')}
        aria-label="Cerrar"
        className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"
      >
        <X size={18} className="text-white" />
      </button>

      {/* TGO badge */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-black/40 rounded-full px-3 py-1.5">
        <div className="w-5 h-5 rounded-md bg-white flex items-center justify-center">
          <span className="text-[9px] font-bold text-black">T</span>
        </div>
        <span className="text-white text-xs font-semibold">TGO APP</span>
      </div>

      {/* Story content */}
      <div
        className="flex-1 flex items-center justify-center relative select-none overflow-hidden"
        {...handlers}
      >
        {story.videoUrl ? (
          <video
            key={story._id}
            ref={videoRef}
            src={story.videoUrl}
            className="w-full h-full object-cover"
            loop
            muted
            playsInline
            autoPlay
          />
        ) : story.imageUrl ? (
          <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: bgColor }}>
            <div className="text-center max-w-md">
              <p className="text-2xl font-black mb-3" style={{ color: txtColor }}>{story.title}</p>
              {story.shortDescription && <p className="text-sm" style={{ color: txtColor + 'cc' }}>{story.shortDescription}</p>}
            </div>
          </div>
        )}

        {/* Overlay gradient + text */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 pt-16">
          <p className="font-bold text-lg leading-tight" style={{ color: txtColor }}>{story.title}</p>
          {story.shortDescription && (
            <p className="text-sm mt-1 leading-tight" style={{ color: txtColor + 'bb' }}>{story.shortDescription}</p>
          )}
          {story.description && (
            <p className="text-xs mt-1.5" style={{ color: txtColor + '80' }}>{story.description}</p>
          )}

          {/* CTA button */}
          {hasCta && (
            <div className="mt-4" onClick={(e) => e.stopPropagation()}>
              <a
                href={cta!.href}
                {...(cta!.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={() => trackPlacement({ ...ctx, type: 'cta_tap', pieceId: story._id, action: 'link' })}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm shadow-lg active:scale-[0.97] transition-transform"
                style={{ backgroundColor: accent, color: 'white' }}
              >
                <ExternalLink size={16} />
                {story.ctaText}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 py-3">
        {stories.slice(0, Math.min(stories.length, 7)).map((s, i) => (
          <button
            key={s._id}
            onClick={() => goTo(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === currentIndex ? 'bg-white scale-125' : 'bg-white/40'
            }`}
          />
        ))}
        {stories.length > 7 && (
          <span className="text-white/40 text-xs ml-1">+{stories.length - 7}</span>
        )}
      </div>
    </div>
  )
}
