'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DeliveryRedirectHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const redirectPath = localStorage.getItem('deliveryRedirect')
    if (redirectPath && !window.location.pathname.startsWith('/delivery')) {
      localStorage.removeItem('deliveryRedirect')
      router.replace(redirectPath)
    }
  }, [router])

  return <>{children}</>
}
