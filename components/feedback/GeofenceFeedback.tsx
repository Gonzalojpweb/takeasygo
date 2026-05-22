'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const GEOFENCE_FLAG = 'tgo_geofence_notified'

export function markGeofenceNotified() {
  sessionStorage.setItem(GEOFENCE_FLAG, Date.now().toString())
}

export function clearGeofenceNotified() {
  sessionStorage.removeItem(GEOFENCE_FLAG)
}

export default function GeofenceFeedback({ tenantSlug }: { tenantSlug: string }) {
  const [visible, setVisible] = useState(false)
  const [feedback, setFeedback] = useState<'loading' | 'yes' | 'no' | null>(null)

  useEffect(() => {
    const flag = sessionStorage.getItem(GEOFENCE_FLAG)
    if (flag) {
      const ts = parseInt(flag, 10)
      // Only show if less than 24h ago
      if (Date.now() - ts < 24 * 60 * 60 * 1000) {
        setVisible(true)
      } else {
        clearGeofenceNotified()
      }
    }
  }, [])

  async function sendGeofenceFeedback(val: boolean) {
    setFeedback(val ? 'yes' : 'no')
    await fetch(`/api/${tenantSlug}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'geofence_notified',
        wasUseful: val ? 'yes' : 'no',
      }),
    }).catch(() => {})
    clearGeofenceNotified()
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-6 left-4 right-4 z-40 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-2xl border-2 border-zinc-100 shadow-xl p-4 space-y-3">
        {feedback === null ? (
          <>
            <p className="text-sm font-semibold text-zinc-800 text-center">
              ¿Te fue útil la notificación que te enviamos cuando estabas cerca?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => sendGeofenceFeedback(true)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-colors active:scale-[0.98]"
              >
                Sí, gracias
              </button>
              <button
                onClick={() => sendGeofenceFeedback(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-100 text-zinc-600 font-bold text-sm hover:bg-zinc-200 transition-colors active:scale-[0.98]"
              >
                No
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm font-medium text-center text-emerald-600">
            {feedback === 'yes' ? '¡Qué bien! Seguimos mejorando.' : 'Gracias por tu opinión.'}
          </p>
        )}
      </div>
    </div>
  )
}
