'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ExternalLink } from 'lucide-react'

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
}

export default function AppStoryViewer({ stories, onClose, primaryColor = '#6366f1' }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const animRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const videoRef = useRef<HTMLVideoElement>(null)
  const DURATION = 7000

  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < stories.length - 1

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index)
    setProgress(0)
    startTimeRef.current = Date.now()
  }, [])

  const goNext = useCallback(() => {
    if (hasNext) goTo(currentIndex + 1)
    else onClose()
  }, [hasNext, currentIndex, goTo, onClose])

  const goPrev = useCallback(() => {
    if (hasPrev) goTo(currentIndex - 1)
  }, [hasPrev, currentIndex, goTo])

  useEffect(() => {
    if (paused || stories.length === 0) return
    startTimeRef.current = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current
      const pct = Math.min(elapsed / DURATION, 1)
      setProgress(pct)
      if (pct >= 1) { goNext(); return }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [currentIndex, paused, stories.length, goNext])

  useEffect(() => {
    if (videoRef.current) {
      if (paused) videoRef.current.pause()
      else videoRef.current.play().catch(() => {})
    }
  }, [paused, currentIndex])

  const handleTap = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.3) goPrev()
    else goNext()
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return
    const diff = e.changedTouches[0].clientX - touchStart
    if (Math.abs(diff) > 50) {
      if (diff > 0) goPrev()
      else goNext()
    }
    setTouchStart(null)
  }

  if (stories.length === 0) return null

  const story = stories[currentIndex]
  const bgColor = story.customStyles?.backgroundColor || '#000'
  const txtColor = story.customStyles?.textColor || '#fff'
  const accent = story.customStyles?.accentColor || primaryColor
  const hasCta = story.ctaText && story.ctaLink

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
        onClick={onClose}
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
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
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
                href={story.ctaLink}
                target="_blank"
                rel="noopener noreferrer"
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
