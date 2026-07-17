'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { toast } from 'sonner'
import type { BoardItem } from './types'

interface UseBoardNewItemDetectorOptions<T extends BoardItem> {
  items: T[]
  alertStatuses: string[]
  soundEnabled: boolean
  soundSrc?: string
  getNewItemToast?: (items: T[]) => { title: string; description: string }
}

export function useBoardNewItemDetector<T extends BoardItem>({
  items,
  alertStatuses,
  soundEnabled,
  soundSrc,
  getNewItemToast,
}: UseBoardNewItemDetectorOptions<T>) {
  const { play: playSound, stop: stopSound } = useNotificationSound(soundSrc)
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set())
  const knownIdsRef = useRef<Set<string>>(new Set(items.map(o => o._id)))
  const ringingIdsRef = useRef<Set<string>>(new Set())

  // Detect new items → sound + toast
  useEffect(() => {
    const incoming = items.filter(o => !knownIdsRef.current.has(o._id))
    const newAlertItems = incoming.filter(o => alertStatuses.includes(o.status))

    if (newAlertItems.length > 0 && soundEnabled) {
      playSound(true)
      newAlertItems.forEach(o => ringingIdsRef.current.add(o._id))
      setNewItemIds(prev => new Set([...prev, ...newAlertItems.map(o => o._id)]))

      const toastContent = getNewItemToast
        ? getNewItemToast(newAlertItems)
        : {
            title: `${newAlertItems.length === 1 ? 'Nuevo item' : `${newAlertItems.length} nuevos items`}`,
            description: newAlertItems.map(o => `#${o._id.slice(-6)}`).join(' — '),
          }

      toast(toastContent.title, {
        description: toastContent.description,
        duration: 8000,
        position: 'top-center',
      })

      // Clear highlight after 8s
      setTimeout(() => {
        setNewItemIds(prev => {
          const next = new Set(prev)
          newAlertItems.forEach(o => next.delete(o._id))
          return next
        })
      }, 8000)
    }

    knownIdsRef.current = new Set(items.map(o => o._id))

    // Stop ring if all processed
    if (ringingIdsRef.current.size > 0) {
      const stillUnprocessed = new Set(
        items.filter(o => alertStatuses.includes(o.status)).map(o => o._id)
      )
      const stillRinging = new Set([...ringingIdsRef.current].filter(id => stillUnprocessed.has(id)))
      if (stillRinging.size === 0) stopSound()
      ringingIdsRef.current = stillRinging
    }
  }, [items, alertStatuses, soundEnabled, playSound, stopSound, getNewItemToast])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSound()
  }, [stopSound])

  return { newItemIds }
}
