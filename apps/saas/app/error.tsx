'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: 'var(--tgo-card)' }}>
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">⚠️</div>
        <h1 className="text-2xl font-black mb-3" style={{ color: 'var(--tgo-text-primary)' }}>Algo salió mal</h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--tgo-text-muted)' }}>
          Ocurrió un error inesperado. Intentá recargar la página.
        </p>
        <button
          onClick={reset}
          className="px-8 py-3 rounded-2xl text-sm font-bold transition-colors"
          style={{ color: 'var(--tgo-text-inverse)', backgroundColor: 'var(--tgo-text-primary)' }}
        >
          Recargar
        </button>
        <p className="text-xs mt-6 font-mono" style={{ color: 'var(--tgo-text-muted)' }}>
          {error.digest && <span style={{ color: 'var(--tgo-state-danger)' }}>Error ID: {error.digest}</span>}
        </p>
      </div>
    </div>
  )
}
