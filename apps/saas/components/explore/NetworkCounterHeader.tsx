'use client'

// ── NetworkCounterHeader ─────────────────────────────────────────────────────
//
// Header que muestra el contador de restaurantes EN RED vs DIRECTORIO.
// Doc 02 §3.2: El contador se mantiene como header conceptual de la pantalla.
//
// Uso:
//   <NetworkCounterHeader networkCount={30} listedCount={20} />

import PuntoTGO from '@/components/tgo/PuntoTGO'

interface NetworkCounterHeaderProps {
  networkCount: number
  listedCount: number
}

export default function NetworkCounterHeader({
  networkCount,
  listedCount,
}: NetworkCounterHeaderProps) {
  return (
    <div
      className="flex items-center justify-center gap-3 py-3"
      style={{
        backgroundColor: 'var(--tgo-surface-2)',
        borderRadius: 'var(--tgo-radius-pill)',
        border: '1px solid var(--tgo-border)',
      }}
    >
      {/* Network counter with PuntoTGO mini */}
      <div className="flex items-center gap-1.5">
        <PuntoTGO variant="inline" size="xs" networkStatus="live" />
        <span
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-label)',
            fontWeight: 700,
          }}
        >
          {networkCount} EN RED
        </span>
      </div>

      {/* Separator */}
      <span style={{ color: 'var(--tgo-text-muted)', fontSize: 8 }}>•</span>

      {/* Listed counter */}
      <span
        style={{
          color: 'var(--tgo-text-muted)',
          fontSize: 'var(--tgo-type-label)',
          fontWeight: 600,
        }}
      >
        {listedCount} DIRECTORIO
      </span>
    </div>
  )
}
