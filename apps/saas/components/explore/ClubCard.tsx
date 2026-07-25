'use client'

import { Trophy, MapPin, ShoppingBag, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

interface ClubCardProps {
  tenantSlug: string
  tenantName: string
  logoUrl: string | null
  primaryColor: string
  clubName: string
  distanceM?: number | null
  hasOrdered?: boolean
  points?: number
  tier?: string
  variant?: 'suggested' | 'mine'
}

function distLabel(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

export default function ClubCard({
  tenantSlug,
  tenantName,
  logoUrl,
  clubName,
  distanceM,
  hasOrdered,
  points,
  variant = 'suggested',
}: ClubCardProps) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(`/app/profile/club/${tenantSlug}`)}
      className="w-full p-4 flex items-center gap-4 group transition-all text-left"
      style={{
        borderRadius: 'var(--tgo-radius-xl)',
        backgroundColor: 'var(--tgo-surface-card)',
        border: '1px solid var(--tgo-border)',
      }}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={tenantName}
          width={44}
          height={44}
          className="rounded-xl shrink-0"
          unoptimized
        />
      ) : (
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--tgo-state-warning-soft)', color: 'var(--tgo-state-warning)' }}
        >
          <Trophy size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: 'var(--tgo-text-primary)' }}>
          {clubName}
        </p>
        {variant === 'mine' && typeof points === 'number' ? (
          <p className="text-[11px] font-black tabular-nums" style={{ color: 'var(--tgo-state-warning)' }}>
            {points} pts
          </p>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] truncate" style={{ color: 'var(--tgo-text-muted)' }}>
              {tenantName}
            </p>
            {distanceM != null && (
              <span className="text-[10px] flex items-center gap-0.5 shrink-0" style={{ color: 'var(--tgo-text-muted)' }}>
                <MapPin size={10} />
                {distLabel(distanceM)}
              </span>
            )}
          </div>
        )}
        {variant === 'suggested' && hasOrdered && (
          <div className="flex items-center gap-1 mt-1">
            <ShoppingBag size={10} style={{ color: 'var(--tgo-text-muted)' }} />
            <span className="text-[9px]" style={{ color: 'var(--tgo-text-muted)' }}>
              Ya pediste acá
            </span>
          </div>
        )}
      </div>
      <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--tgo-text-muted)' }} />
    </button>
  )
}
