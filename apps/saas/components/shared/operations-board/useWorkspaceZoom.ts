'use client'

import { useState, useCallback, useEffect } from 'react'

const ZOOM_KEY = 'takeasygo-workspace-zoom'
const ZOOM_LEVELS = [0.75, 0.85, 1.0, 1.2, 1.5] as const
const DEFAULT_ZOOM = 1.0

function getStoredZoom(): number {
  if (typeof window === 'undefined') return DEFAULT_ZOOM
  try {
    const stored = localStorage.getItem(ZOOM_KEY)
    if (stored) {
      const parsed = parseFloat(stored)
      if (ZOOM_LEVELS.includes(parsed as any)) return parsed
    }
  } catch {}
  return DEFAULT_ZOOM
}

function storeZoom(level: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(level))
  } catch {}
}

export function useWorkspaceZoom() {
  const [zoom, setZoomState] = useState(DEFAULT_ZOOM)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setZoomState(getStoredZoom())
    setMounted(true)
  }, [])

  const setZoom = useCallback((level: number) => {
    const clamped = ZOOM_LEVELS.reduce((prev, curr) =>
      Math.abs(curr - level) < Math.abs(prev - level) ? curr : prev
    )
    setZoomState(clamped)
    storeZoom(clamped)
  }, [])

  const zoomIn = useCallback(() => {
    setZoomState(prev => {
      const idx = ZOOM_LEVELS.indexOf(prev as any)
      const next = idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : prev
      storeZoom(next)
      return next
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoomState(prev => {
      const idx = ZOOM_LEVELS.indexOf(prev as any)
      const next = idx > 0 ? ZOOM_LEVELS[idx - 1] : prev
      storeZoom(next)
      return next
    })
  }, [])

  const resetZoom = useCallback(() => {
    setZoomState(DEFAULT_ZOOM)
    storeZoom(DEFAULT_ZOOM)
  }, [])

  const zoomPercent = Math.round(zoom * 100)

  return { zoom, zoomPercent, setZoom, zoomIn, zoomOut, resetZoom, mounted }
}
