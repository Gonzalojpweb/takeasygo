'use client'

import { useEffect, useRef } from 'react'

interface Props {
  token: string
}

export default function DeliveryPushSetup({ token }: Props) {
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    done.current = true

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        })

        const json = sub.toJSON()
        if (!json.endpoint) return

        await fetch('/api/delivery/push-subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-delivery-token': token,
          },
          body: JSON.stringify({
            endpoint: json.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          }),
        })
      } catch {
        // Silently fail — push is optional
      }
    }

    register()
  }, [token])

  return null
}
