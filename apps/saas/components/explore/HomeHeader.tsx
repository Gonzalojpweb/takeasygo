'use client'

// ── HomeHeader ────────────────────────────────────────────────────────────────
//
// Sección personalizada del home.
// Avatar + nombre + saludo contextual.
// Los datos vienen del onboarding y la sesión del usuario.

import Image from 'next/image'
import { User } from 'lucide-react'

interface HomeHeaderProps {
  userName?: string
  userAvatar?: string | null
}

function getGreeting(): { period: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return { period: 'Buenos días', emoji: '☀️' }
  if (hour >= 12 && hour < 19) return { period: 'Buenas tardes', emoji: '🌤' }
  return { period: 'Buenas noches', emoji: '🌙' }
}

export default function HomeHeader({ userName, userAvatar }: HomeHeaderProps) {
  const { period } = getGreeting()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: 'var(--tgo-space-5) var(--tgo-page-padding) var(--tgo-space-3)',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--tgo-radius-xl)',
          overflow: 'hidden',
          flexShrink: 0,
          background: userAvatar ? 'transparent' : 'var(--tgo-brand-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: userAvatar ? 'none' : '0 2px 8px rgba(247, 66, 17, 0.25)',
        }}
      >
        {userAvatar ? (
          <Image
            src={userAvatar}
            alt={userName || ''}
            width={52}
            height={52}
            className="object-cover"
            unoptimized
          />
        ) : (
          <span
            style={{
              color: '#FFFFFF',
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {userName ? userName.charAt(0).toUpperCase() : <User size={24} />}
          </span>
        )}
      </div>

      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: 'var(--tgo-type-title)',
            fontWeight: 700,
            color: 'var(--tgo-text-primary)',
            letterSpacing: 'var(--tgo-tracking-tight)',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {period}, {userName ?? ''}
        </h1>
        <p
          style={{
            fontSize: 'var(--tgo-type-body-sm)',
            color: 'var(--tgo-text-secondary)',
            marginTop: 2,
          }}
        >
          ¿Qué querés comer hoy?
        </p>
      </div>
    </div>
  )
}
