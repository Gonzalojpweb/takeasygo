'use client'

export default function TrackingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📋</div>
        <h1 className="text-xl font-bold mb-2 text-zinc-900">No pudimos cargar el seguimiento</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Tu pedido fue recibido. Intentá recargar la página para ver el estado actualizado.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
