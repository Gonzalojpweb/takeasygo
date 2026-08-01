'use client'

import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, ArrowRight } from 'lucide-react'

interface Props {
  show: boolean
  tenantName: string
  tenantLogoUrl?: string | null
  totalOrders: number
  hasClub: boolean
  nearbyCount: number | null
  nearbyWithin15min: number | null
  caseType: 'A' | 'B' | 'C'
  onExplore: () => void
  onDismiss: () => void
}

function getCopy(caseType: Props['caseType'], tenantName: string, nearbyCount: number | null, nearbyWithin15min: number | null) {
  // When there are restaurants within 15min walking, show that count + time claim
  // Otherwise show total count with generic "cerca tuyo"
  const displayCount = (nearbyWithin15min ?? 0) > 0 ? nearbyWithin15min : nearbyCount
  const nearbyText = displayCount ? `Hay ${displayCount} lugares más` : 'Hay más lugares'
  const suffix = (nearbyWithin15min ?? 0) > 0 ? 'a menos de 15 minutos' : 'cerca tuyo'

  switch (caseType) {
    case 'C':
      return {
        headline: `Ya conocés bien a ${tenantName}.`,
        sub: `${nearbyText} ${suffix}.`,
      }
    case 'B':
      return {
        headline: `Sos miembro del club de ${tenantName}.`,
        sub: 'En TGO hay más beneficios cerca tuyo.',
      }
    case 'A':
    default:
      return {
        headline: `Ya conocés ${tenantName}.`,
        sub: `${nearbyText} ${suffix}.`,
      }
  }
}

export default function NetworkDiscoveryOnboarding({
  show,
  tenantName,
  tenantLogoUrl,
  totalOrders,
  hasClub,
  nearbyCount,
  nearbyWithin15min,
  caseType,
  onExplore,
  onDismiss,
}: Props) {
  const copy = getCopy(caseType, tenantName, nearbyCount, nearbyWithin15min)

  const handleExplore = useCallback(() => {
    onExplore()
  }, [onExplore])

  const handleDismiss = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="network-onboarding"
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'var(--tgo-surface-0)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Content */}
          <div className="flex-1 flex flex-col items-center justify-center px-8 pb-12">
            {/* Illustration */}
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <svg
                width="200"
                height="160"
                viewBox="0 0 200 160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Sky / background buildings */}
                <rect x="20" y="60" width="30" height="80" rx="2" fill="var(--tgo-surface)" />
                <rect x="55" y="40" width="25" height="100" rx="2" fill="var(--tgo-divider)" />
                <rect x="85" y="50" width="35" height="90" rx="2" fill="var(--tgo-surface)" />
                <rect x="125" y="35" width="28" height="105" rx="2" fill="var(--tgo-divider)" />
                <rect x="158" y="55" width="22" height="85" rx="2" fill="var(--tgo-surface)" />

                {/* Windows */}
                <rect x="28" y="70" width="6" height="6" rx="1" fill="var(--tgo-card)" />
                <rect x="38" y="70" width="6" height="6" rx="1" fill="var(--tgo-card)" />
                <rect x="28" y="82" width="6" height="6" rx="1" fill="var(--tgo-card)" />
                <rect x="38" y="82" width="6" height="6" rx="1" fill="var(--tgo-card)" />

                <rect x="62" y="50" width="5" height="5" rx="1" fill="var(--tgo-card)" />
                <rect x="70" y="50" width="5" height="5" rx="1" fill="var(--tgo-card)" />
                <rect x="62" y="60" width="5" height="5" rx="1" fill="var(--tgo-card)" />
                <rect x="70" y="60" width="5" height="5" rx="1" fill="var(--tgo-card)" />

                <rect x="95" y="60" width="6" height="6" rx="1" fill="var(--tgo-card)" />
                <rect x="106" y="60" width="6" height="6" rx="1" fill="var(--tgo-card)" />
                <rect x="95" y="72" width="6" height="6" rx="1" fill="var(--tgo-card)" />
                <rect x="106" y="72" width="6" height="6" rx="1" fill="var(--tgo-card)" />

                {/* Trees / life */}
                <circle cx="45" cy="130" r="10" fill="var(--tgo-state-activity)" />
                <circle cx="140" cy="128" r="8" fill="var(--tgo-state-activity)" />
                <circle cx="170" cy="132" r="7" fill="var(--tgo-state-activity)" />

                {/* Ground */}
                <rect x="0" y="140" width="200" height="20" fill="var(--tgo-surface)" />

                {/* Pin — the known restaurant */}
                <g transform="translate(90, 20)">
                  <path
                    d="M10 30C10 30 25 22 25 13C25 6.4 20.1 1 14 1C7.9 1 3 6.4 3 13C3 22 10 30 10 30Z"
                    fill="var(--tgo-state-action)"
                  />
                  <circle cx="14" cy="13" r="4" fill="white" />
                </g>
              </svg>
            </motion.div>

            {/* Tenant logo (small, familiar) */}
            {tenantLogoUrl && (
              <motion.div
                className="mb-4"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <div
                  className="w-10 h-10 rounded-full overflow-hidden border-2"
                  style={{ borderColor: 'var(--tgo-divider)' }}
                >
                  <img
                    src={tenantLogoUrl}
                    alt={tenantName}
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.div>
            )}

            {/* Copy */}
            <motion.div
              className="text-center max-w-sm"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1
                className="text-xl font-bold mb-2"
                style={{
                  color: 'var(--tgo-text-primary)',
                  fontSize: 'var(--tgo-type-heading)',
                }}
              >
                {copy.headline}
              </h1>
              <p
                className="text-sm"
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 'var(--tgo-type-body)',
                  lineHeight: 1.5,
                }}
              >
                {copy.sub}
              </p>
              <p
                className="mt-3 text-xs"
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 'var(--tgo-type-caption)',
                }}
              >
                Descubrí la red de comercios locales de tu barrio.
              </p>
            </motion.div>
          </div>

          {/* Buttons */}
          <motion.div
            className="px-8 pb-10 flex flex-col gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Primary — Explorar */}
            <button
              onClick={handleExplore}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full font-bold text-sm transition-colors"
              style={{
                backgroundColor: 'var(--tgo-state-action)',
                color: 'white',
                fontSize: 'var(--tgo-type-body)',
              }}
            >
              <MapPin size={16} />
              Explorar cerca mío
              <ArrowRight size={14} />
            </button>

            {/* Secondary — Ahora no */}
            <button
              onClick={handleDismiss}
              className="w-full py-3 rounded-full text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--tgo-text-link)',
                fontSize: 'var(--tgo-type-body)',
              }}
            >
              Ahora no
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
