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
      onClick={() => router.push(`/explore/profile/club/${tenantSlug}`)}
      className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group hover:border-[var(--c-border-active)] transition-all text-left"
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
        <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
          <Trophy size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#f7f4f2] truncate">{clubName}</p>
        {variant === 'mine' && typeof points === 'number' ? (
          <p className="text-[11px] font-black text-amber-500 tabular-nums">
            {points} pts
          </p>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-[#5a524d] truncate">{tenantName}</p>
            {distanceM != null && (
              <span className="text-[10px] text-[#5a524d] flex items-center gap-0.5 shrink-0">
                <MapPin size={10} />
                {distLabel(distanceM)}
              </span>
            )}
          </div>
        )}
        {variant === 'suggested' && hasOrdered && (
          <div className="flex items-center gap-1 mt-1">
            <ShoppingBag size={10} className="text-[#5a524d]" />
            <span className="text-[9px] text-[#5a524d]">Ya pediste acá</span>
          </div>
        )}
      </div>
      <ChevronRight size={16} className="text-[#5a524d] group-hover:translate-x-1 transition-transform shrink-0" />
    </button>
  )
}
