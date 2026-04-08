'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">⚠️</div>
          <h1 className="text-2xl font-black mb-3 text-zinc-900">Algo salió mal</h1>
          <p className="text-zinc-500 mb-6 text-sm">
            Ocurrió un error inesperado. Intentá recargar la página.
          </p>
          <button
            onClick={reset}
            className="px-8 py-3 rounded-2xl text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-700 transition-colors"
          >
            Recargar
          </button>
          <p className="text-xs text-zinc-300 mt-6 font-mono">
            {error.digest && <span className="text-red-400">Error ID: {error.digest}</span>}
          </p>
        </div>
      </body>
    </html>
  )
}
