'use client'

import { useState, useEffect } from 'react'

interface WelcomeBackgroundProps {
  hero: {
    mediaType: 'image' | 'video' | 'none'
    url: string
    showLogo?: boolean
  }
  hasHero: boolean
  backgroundColor: string
}

export default function WelcomeBackground({ hero, hasHero, backgroundColor }: WelcomeBackgroundProps) {
  const [isVertical, setIsVertical] = useState(false)

  useEffect(() => {
    if (hero.mediaType !== 'image' || !hero.url) return

    const img = new Image()
    img.src = hero.url
    img.onload = () => {
      // Relación de aspecto vertical o cuadrada (< 1.25)
      const ratio = img.naturalWidth / img.naturalHeight
      setIsVertical(ratio < 1.25)
    }
  }, [hero.url, hero.mediaType])

  if (!hasHero) {
    return (
      <div 
        className="absolute inset-0 z-0" 
        style={{ backgroundColor }} 
      />
    )
  }

  return (
    <div 
      className="absolute inset-0 z-0 overflow-hidden" 
      style={{ backgroundColor }}
    >
      {hero.mediaType === 'image' && (
        <img
          src={hero.url}
          alt=""
          className={`absolute inset-0 w-full h-full transition-all duration-300 ${
            isVertical ? 'object-contain p-4' : 'object-cover'
          }`}
          style={{
            objectPosition: 'center',
          }}
          aria-hidden
          loading="eager"
        />
      )}
      {hero.mediaType === 'video' && (
        <video
          aria-hidden
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src={hero.url}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </div>
  )
}
