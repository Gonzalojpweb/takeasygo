'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DeliveryRedirectHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const redirectPath = localStorage.getItem('deliveryRedirect')
    if (!redirectPath) return

    // Solo redirigir desde /app o /
    if (window.location.pathname !== '/app' && window.location.pathname !== '/') return

    // Extraer token de la ruta /{tenant}/delivery/{token}
    const match = redirectPath.match(/\/delivery\/(.+)$/)
    if (!match) {
      localStorage.removeItem('deliveryRedirect')
      return
    }
    const token = match[1]

    // Validar que el delivery sigue activo antes de redirigir
    fetch('/api/delivery/me', { headers: { 'x-delivery-token': token } })
      .then(res => {
        if (res.ok) {
          localStorage.removeItem('deliveryRedirect')
          router.replace(redirectPath)
        } else {
          localStorage.removeItem('deliveryRedirect')
        }
      })
      .catch(() => {
        localStorage.removeItem('deliveryRedirect')
      })
  }, [router])

  return <>{children}</>
}
