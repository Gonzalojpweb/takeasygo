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
  getNewItemToast?: (items: T[], onAttend: () => void) => { title: string; description: string }
  onAttend?: () => void
}

interface EscalationTimers {
  nudge: ReturnType<typeof setTimeout> | null
  escalate: ReturnType<typeof setTimeout> | null
  repeat: ReturnType<typeof setInterval> | null
}

const NUDGE_DELAY = 10_000    // 10s — first reinforcement sound
const ESCALATE_DELAY = 30_000 // 30s — visual escalation (red ring)
const REPEAT_INTERVAL = 30_000 // 30s — repeated sound while unattended

export function useBoardNewItemDetector<T extends BoardItem>({
  items,
  alertStatuses,
  soundEnabled,
  soundSrc,
  getNewItemToast,
  onAttend,
}: UseBoardNewItemDetectorOptions<T>) {
  const { play: playSound, stop: stopSound, playOnce } = useNotificationSound(soundSrc)
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set())
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set())
  const knownIdsRef = useRef<Set<string>>(new Set(items.map(o => o._id)))
  const ringingIdsRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<EscalationTimers>({ nudge: null, escalate: null, repeat: null })

  // Clear all escalation timers
  const clearTimers = useCallback(() => {
    const t = timersRef.current
    if (t.nudge) { clearTimeout(t.nudge); t.nudge = null }
    if (t.escalate) { clearTimeout(t.escalate); t.escalate = null }
    if (t.repeat) { clearInterval(t.repeat); t.repeat = null }
  }, [])

  // Nudge callback (10s reinforcement)
  const onNudge = useCallback(() => {
    timersRef.current.nudge = null
    if (ringingIdsRef.current.size > 0) {
      playOnce()
    }
  }, [playOnce])

  // Escalate callback (30s — visual + start repeat)
  const onEscalate = useCallback(() => {
    timersRef.current.escalate = null
    if (ringingIdsRef.current.size > 0) {
      setEscalatedIds(new Set(ringingIdsRef.current))
      // Start repeat loop for spaced sound alerts
      timersRef.current.repeat = setInterval(() => {
        if (ringingIdsRef.current.size > 0) {
          playOnce()
          setEscalatedIds(new Set(ringingIdsRef.current))
        } else {
          clearTimers()
        }
      }, REPEAT_INTERVAL)
    }
  }, [playOnce, clearTimers])

  // Start timers for a new wave (only if no timers are active)
  const startWaveTimers = useCallback(() => {
    const t = timersRef.current
    if (!t.nudge && !t.escalate && !t.repeat) {
      t.nudge = setTimeout(onNudge, NUDGE_DELAY)
      t.escalate = setTimeout(onEscalate, ESCALATE_DELAY)
    }
  }, [onNudge, onEscalate])

  // Mark an order as attended (remove from ringing + escalated)
  const markAttended = useCallback((orderId: string) => {
    ringingIdsRef.current.delete(orderId)
    setEscalatedIds(prev => {
      if (!prev.has(orderId)) return prev
      const next = new Set(prev)
      next.delete(orderId)
      return next
    })
    // If wave is empty, clean up everything
    if (ringingIdsRef.current.size === 0) {
      stopSound()
      clearTimers()
      setEscalatedIds(new Set())
    }
  }, [stopSound, clearTimers])

  // Detect new items → sound + toast + escalation
  useEffect(() => {
    const incoming = items.filter(o => !knownIdsRef.current.has(o._id))
    const newAlertItems = incoming.filter(o => alertStatuses.includes(o.status))

    if (newAlertItems.length > 0 && soundEnabled) {
      playSound(true)
      newAlertItems.forEach(o => ringingIdsRef.current.add(o._id))
      setNewItemIds(prev => new Set([...prev, ...newAlertItems.map(o => o._id)]))

      // Start wave timers (only if no timers active — handles concurrent arrivals)
      startWaveTimers()

      const handleAttend = onAttend ?? (() => {})

      const toastContent = getNewItemToast
        ? getNewItemToast(newAlertItems, handleAttend)
        : {
            title: `${newAlertItems.length === 1 ? 'Nuevo item' : `${newAlertItems.length} nuevos items`}`,
            description: newAlertItems.map(o => `#${o._id.slice(-6)}`).join(' — '),
          }

      toast(toastContent.title, {
        description: toastContent.description,
        duration: 8000,
        position: 'top-center',
        action: {
          label: 'Atender',
          onClick: handleAttend,
        },
      })
    }

    knownIdsRef.current = new Set(items.map(o => o._id))

    // Stop ring if all processed (status moved out of alertStatuses)
    if (ringingIdsRef.current.size > 0) {
      const stillUnprocessed = new Set(
        items.filter(o => alertStatuses.includes(o.status)).map(o => o._id)
      )
      const stillRinging = new Set([...ringingIdsRef.current].filter(id => stillUnprocessed.has(id)))

      // Diff: orders that were resolved since last check
      const newlyResolved = [...ringingIdsRef.current].filter(id => !stillUnprocessed.has(id))
      newlyResolved.forEach(id => {
        setEscalatedIds(prev => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })

      if (stillRinging.size === 0) {
        stopSound()
        clearTimers()
        setEscalatedIds(new Set())
      }
      ringingIdsRef.current = stillRinging
    }
  }, [items, alertStatuses, soundEnabled, playSound, stopSound, getNewItemToast, onAttend, startWaveTimers, clearTimers, playOnce])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers()
      stopSound()
    }
  }, [clearTimers, stopSound])

  return { newItemIds, escalatedIds, markAttended }
}
