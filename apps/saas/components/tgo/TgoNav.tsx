'use client'

import Link from 'next/link'

export default function TgoNav() {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(20, 23, 28, 0.92)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--tgo-line-on-ink)',
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/tgo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg viewBox="0 0 64 64" width={34} height={34} fill="none">
            <circle cx="32" cy="32" r="30" stroke="#F74211" strokeWidth="2.5" strokeDasharray="3 5" />
            <circle cx="32" cy="32" r="21" fill="#F74211" />
            <circle cx="26" cy="29" r="2.4" fill="#14171C" />
            <circle cx="38" cy="29" r="2.4" fill="#14171C" />
            <path d="M24 37c4 5 12 5 16 0" stroke="#14171C" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </svg>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--tgo-text-on-ink)',
              fontFamily: 'var(--font-big-shoulders), sans-serif',
            }}
          >
            TGO
          </span>
        </Link>

        <div
          style={{
            display: 'flex',
            gap: 30,
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--tgo-text-on-ink-soft)',
          }}
          className="tgo-nav-links"
        >
          <a href="#ciudad">La ciudad de los 15&apos;</a>
          <a href="#vivo">Cómo funciona</a>
          <a href="#confianza">Confianza</a>
          <a href="#restaurantes">Para restaurantes</a>
        </div>

        <Link
          href="/app"
          style={{
            background: 'var(--tgo-signal)',
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 700,
            padding: '10px 20px',
            borderRadius: 8,
          }}
        >
          Descargar app
        </Link>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .tgo-nav-links { display: none !important; }
        }
      `}</style>
    </nav>
  )
}
