'use client'

import Link from 'next/link'
import { Award, UserPlus, Wallet, Smartphone, Store } from 'lucide-react'
import PoweredByTakeasy from '@/components/PoweredByTakeasy'

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
  return (
    <section className="py-14 px-4" style={{ backgroundColor: bgDark }}>
      <div className="max-w-2xl mx-auto space-y-10">

        {showClub && clubMembership.isMember && (
          <div className="text-center space-y-5">
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
        )}

        <div className="text-center space-y-5">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-px w-10" style={{ backgroundColor: primaryColor + '40' }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <div className="h-px w-10" style={{ backgroundColor: primaryColor + '40' }} />
          </div>
          <h3 className="text-xl font-bold" style={{ color: primaryColor, fontFamily: 'var(--font-heading)' }}>
            Red de la Proximidad
          </h3>
          <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: '#94a3b8' }}>
            <span className="font-semibold" style={{ color: '#cbd5e1' }}>{tenantName}</span> es parte de la red TakeasyGO.
          </p>
          <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: '#94a3b8' }}>
            Descubrí lugares, propuestas y experiencias cerca tuyo.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <a
              href="https://takeasygo.com/app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#f74211' }}
            >
              <Smartphone size={16} />
              Descargar App
            </a>
            <PoweredByTakeasy variant="dark" label="network" tenantSlug={tenantSlug} />
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
    </section>
  )
}
