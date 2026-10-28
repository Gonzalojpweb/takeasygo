'use client'

import Link from 'next/link'
import { Award, UserPlus, Wallet, Smartphone, Store } from 'lucide-react'

interface ClubMembership {
  isMember: boolean
  name: string
  walletEnabled: boolean
}

interface Props {
  tenantSlug: string
  tenantName: string
  primaryColor: string
  bgDark: string
  clubMembership: ClubMembership
  showClub: boolean
}

export default function EndOfMenuSection({
  tenantSlug,
  tenantName,
  primaryColor,
  bgDark,
  clubMembership,
  showClub,
}: Props) {
  const showClubBlock = showClub && clubMembership.isMember

  return (
    <section style={{ backgroundColor: bgDark }}>

      {showClubBlock && (
        <div className="py-12 px-4">
          <div className="max-w-2xl mx-auto text-center space-y-5">
            <h3 className="text-xl font-bold" style={{ color: primaryColor, fontFamily: 'var(--font-heading)' }}>
              Tu Club
            </h3>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href={`/${tenantSlug}/club/lookup`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ backgroundColor: primaryColor, color: '#FFFFFF' }}
              >
                <Award size={16} />
                Socio del Club — {clubMembership.name}
              </Link>
              <Link
                href={`/${tenantSlug}/club/invitar`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ backgroundColor: primaryColor, color: '#FFFFFF' }}
              >
                <UserPlus size={16} />
                Invitá y ganá
              </Link>
            </div>
            {clubMembership.walletEnabled && (
              <Link
                href={`/${tenantSlug}/club/lookup`}
                className="inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
                style={{ color: '#94a3b8' }}
              >
                <Wallet size={14} />
                Añadir a billetera digital
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Red de la Proximidad — con separación diagonal ── */}
      <div
        className="relative"
        style={{
          backgroundColor: '#0f172a',
          clipPath: 'polygon(0 24px, 100% 0, 100% 100%, 0 100%)',
          marginTop: showClubBlock ? '-8px' : '0',
        }}
      >
        <div className="py-14 px-4 pt-20">
          <div className="max-w-2xl mx-auto text-center space-y-5">
            <h3 className="text-xl font-bold" style={{ color: primaryColor, fontFamily: 'var(--font-heading)' }}>
              Red de la Proximidad
            </h3>
            <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: '#94a3b8' }}>
              <span className="font-semibold" style={{ color: '#cbd5e1' }}>{tenantName}</span> es parte de la red TakeasyGO.
            </p>
            <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: '#94a3b8' }}>
              Descubrí lugares, propuestas y experiencias cerca tuyo.
            </p>

            <div className="pt-2">
              <a
                href="https://takeasygo.com/app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: '#f74211' }}
              >
                <Smartphone size={16} />
                Descargá la App
              </a>
            </div>

            <a
              href="https://takeasygo.com/sumar"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: '#64748b' }}
            >
              <Store size={13} />
              Sumá tu comercio a la red
            </a>
          </div>
        </div>
      </div>

    </section>
  )
}
