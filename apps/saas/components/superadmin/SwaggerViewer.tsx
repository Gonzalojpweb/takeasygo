'use client'

// Swagger UI empaquetado (swagger-ui-dist) — sin CDN: la CSP del sitio solo
// permite scripts propios. Se carga recién en esta página (import dinámico).

import { useEffect, useRef, useState } from 'react'
import 'swagger-ui-dist/swagger-ui.css'

export default function SwaggerViewer({ specUrl }: { specUrl: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    import('swagger-ui-dist/swagger-ui-bundle.js')
      .then((mod) => {
        if (cancelled || !ref.current) return
        const SwaggerUIBundle = (mod as { default?: unknown }).default ?? mod
        ;(SwaggerUIBundle as (opts: Record<string, unknown>) => unknown)({
          domNode: ref.current,
          url: specUrl,
          deepLinking: true,
          docExpansion: 'list',
          defaultModelsExpandDepth: 0,
          persistAuthorization: false,
          tryItOutEnabled: false,
          filter: true,
        })
      })
      .catch(() => !cancelled && setError('No se pudo cargar Swagger UI'))
    return () => {
      cancelled = true
    }
  }, [specUrl])

  return (
    <div className="rounded-xl border border-border bg-white p-2">
      {error ? <p className="p-4 text-sm text-red-600">{error}</p> : <div ref={ref} />}
    </div>
  )
}
