'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function SourceTracker() {
  const searchParams = useSearchParams()
  const source = searchParams.get('source')

  useEffect(() => {
    if (source) {
      // Guardamos en sessionStorage para la sesión actual
      sessionStorage.setItem('tgo_attribution_source', source)
      
      // También en localStorage por si cierra y vuelve a entrar luego (opcional, pero útil para ROI)
      localStorage.setItem('tgo_last_attribution_source', source)
      localStorage.setItem('tgo_attribution_date', new Date().toISOString())
    }
  }, [source])

  return null
}
