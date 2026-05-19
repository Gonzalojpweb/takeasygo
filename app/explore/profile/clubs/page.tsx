'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Trophy, Loader2, AlertCircle, MapPin } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import ClubCard from '@/components/explore/ClubCard'

interface ClubSummary {
  tenantSlug: string
  tenantName: string
  logoUrl: string | null
  primaryColor: string
  points: number
  tier: string
  totalOrders: number
  lastOrderAt: string | null
  clubName: string
}

interface SuggestedClub {
  tenantSlug: string
  tenantName: string
  logoUrl: string | null
  primaryColor: string
  distanceM: number | null
  hasOrdered: boolean
  clubName: string
}

export default function ClubsDiscoveryPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  const [myClubs, setMyClubs] = useState<ClubSummary[]>([])
  const [suggestedClubs, setSuggestedClubs] = useState<SuggestedClub[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/explore/profile')
      return
    }
    if (status !== 'authenticated') return

    setLoading(true)
    fetch('/api/explore/loyalty/clubs')
      .then(res => res.json())
      .then(data => {
        setMyClubs(data.myClubs || [])
        setSuggestedClubs(data.suggestedClubs || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status, router])

  return (
    <div className="min-h-screen bg-[#0d0b0a] text-[#f7f4f2]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0d0b0a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--c-surface)] hover:bg-[var(--c-border)] transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-black">Clubes de Fidelización</h1>
        </div>
      </header>

      <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={24} className="text-amber-500 animate-spin" />
            <p className="text-sm text-[#5a524d]">Buscando clubs...</p>
          </div>
        ) : (
          <>
            {/* Mis clubs */}
            {myClubs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Trophy size={16} className="text-amber-500" />
                  <h2 className="text-sm font-bold">Tus Clubs</h2>
                  <span className="text-[10px] text-[#5a524d]">({myClubs.length})</span>
                </div>
                <div className="space-y-2">
                  {myClubs.map(club => (
                    <ClubCard
                      key={club.tenantSlug}
                      variant="mine"
                      tenantSlug={club.tenantSlug}
                      tenantName={club.tenantName}
                      logoUrl={club.logoUrl}
                      primaryColor={club.primaryColor}
                      clubName={club.clubName}
                      points={club.points}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Clubs sugeridos */}
            {suggestedClubs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={16} className="text-[#5a524d]" />
                  <h2 className="text-sm font-bold">Descubrí más clubs</h2>
                  <span className="text-[10px] text-[#5a524d]">({suggestedClubs.length})</span>
                </div>
                <div className="space-y-2">
                  {suggestedClubs.map(club => (
                    <ClubCard
                      key={club.tenantSlug}
                      variant="suggested"
                      tenantSlug={club.tenantSlug}
                      tenantName={club.tenantName}
                      logoUrl={club.logoUrl}
                      primaryColor={club.primaryColor}
                      clubName={club.clubName}
                      distanceM={club.distanceM}
                      hasOrdered={club.hasOrdered}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {myClubs.length === 0 && suggestedClubs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <AlertCircle size={32} className="text-[#5a524d]" />
                <p className="text-sm text-[#5a524d]">No hay clubs disponibles por ahora.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
