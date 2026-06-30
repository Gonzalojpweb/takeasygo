'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(false)
  const isNavigating = useRef(false)
  const prevPath = useRef(pathname)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Intercept internal link clicks
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href]')
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return

      isNavigating.current = true
      setActive(true)
      setProgress(12)

      // Safety reset in case navigation fails or goes to same path
      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => {
        isNavigating.current = false
        setActive(false)
        setProgress(0)
      }, 8000)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // Tick progress forward while active
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setProgress(p => {
        if (p >= 85) return p
        return p + Math.max(1, (85 - p) * 0.08)
      })
    }, 250)
    return () => clearInterval(id)
  }, [active])

  // When pathname changes, complete and hide
  useEffect(() => {
    if (!isNavigating.current || pathname === prevPath.current) return
    prevPath.current = pathname
    isNavigating.current = false

    if (resetTimer.current) clearTimeout(resetTimer.current)

    setProgress(100)
    const t = setTimeout(() => {
      setActive(false)
      setProgress(0)
    }, 500)
    return () => clearTimeout(t)
  }, [pathname])

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 z-[9999] h-[2px] bg-primary pointer-events-none"
      style={{
        width: `${progress}%`,
        opacity: active ? 1 : 0,
        transition: progress === 100
          ? 'width 250ms ease-out, opacity 250ms ease 300ms'
          : 'width 350ms ease-out',
      }}
    />
  )
}
