'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function TgoHero() {
  const [openCount, setOpenCount] = useState(28)
  const [updatedAt, setUpdatedAt] = useState('actualizado hace instantes')

  useEffect(() => {
    let seconds = 0
    const interval = setInterval(() => {
      seconds += 4
      setUpdatedAt(seconds < 60 ? `actualizado hace ${seconds}s` : 'actualizado hace 1 min')
      if (seconds >= 60) seconds = 0

      const base = 28
      const delta = Math.random() > 0.6 ? (Math.random() > 0.5 ? 1 : -1) : 0
      setOpenCount(base + delta)
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  return (
    <header
      style={{
        background: 'var(--tgo-ink)',
        color: 'var(--tgo-text-on-ink)',
        padding: 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '60px 28px 0',
        }}
      >
        {/* Live ticker */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            width: 'fit-content',
            border: '1px solid var(--tgo-line-on-ink)',
            borderRadius: 6,
            padding: '7px 12px',
            fontSize: 12.5,
            color: 'var(--tgo-text-on-ink-soft)',
            marginBottom: 28,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--tgo-go)',
              animation: 'tgo-pulse 1.8s infinite',
              display: 'inline-block',
            }}
          />
          Tu barrio está activo ahora mismo
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: 'var(--font-big-shoulders), sans-serif',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            lineHeight: 0.94,
            fontSize: 'clamp(40px, 7.4vw, 92px)',
            maxWidth: 920,
          }}
        >
          La ciudad<br />que responde<br />en 15 minutos.
        </h1>

        <p
          style={{
            fontSize: 16.5,
            color: 'var(--tgo-text-on-ink-soft)',
            lineHeight: 1.62,
            marginTop: 26,
            maxWidth: 460,
          }}
        >
          TGO mapea tu barrio en tiempo real: lo que está abierto ahora, lo que es confiable de verdad, y lo que tenés a menos de 15 minutos caminando.
        </p>

        {/* Install block */}
        <div style={{ marginTop: 34, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <Link
            href="/app"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--tgo-signal)',
              color: '#fff',
              border: 'none',
              fontFamily: 'var(--font-ibm-plex-sans), sans-serif',
              fontSize: 15.5,
              fontWeight: 700,
              padding: '16px 26px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v13M7 11l5 5 5-5M5 21h14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Instalar TGO ahora
          </Link>
          <div style={{ fontSize: 12.5, color: 'var(--tgo-text-on-ink-soft)', lineHeight: 1.5 }}>
            Te lleva a la app — se instala directo desde el navegador.<br />
            <strong style={{ color: 'var(--tgo-text-on-ink)' }}>Próximamente</strong> en App Store y Google Play.
          </div>
        </div>

        {/* Map with live badge */}
        <div style={{ marginTop: 56, position: 'relative' }}>
          <svg viewBox="0 0 1120 460" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {/* Street grid */}
            <line x1="0" y1="120" x2="1120" y2="90" stroke="rgba(247,66,17,0.22)" strokeWidth="2" />
            <line x1="0" y1="240" x2="1120" y2="270" stroke="rgba(247,66,17,0.14)" strokeWidth="1.5" />
            <line x1="150" y1="0" x2="190" y2="460" stroke="rgba(247,66,17,0.14)" strokeWidth="1.5" />
            <line x1="600" y1="0" x2="640" y2="460" stroke="rgba(247,66,17,0.22)" strokeWidth="2" />
            <line x1="900" y1="0" x2="940" y2="460" stroke="rgba(247,66,17,0.1)" strokeWidth="1.5" />
            <line x1="0" y1="380" x2="1120" y2="400" stroke="rgba(247,66,17,0.1)" strokeWidth="1.5" />

            {/* Location dots */}
            <circle cx="240" cy="150" r="4" fill="#9A9E8F" opacity="0.7" />
            <circle cx="760" cy="130" r="4" fill="#9A9E8F" opacity="0.7" />
            <circle cx="880" cy="330" r="4" fill="#9A9E8F" opacity="0.7" />
            <circle cx="340" cy="330" r="4" fill="#2FBF71" />
            <circle cx="340" cy="330" r="10" fill="none" stroke="#2FBF71" strokeWidth="1.5" opacity="0.5" />

            {/* Main pin */}
            <g transform="translate(600,230)">
              <circle r="46" fill="none" stroke="#F74211" strokeWidth="1" opacity="0.35" />
              <circle r="30" fill="none" stroke="#F74211" strokeWidth="1" opacity="0.5" />
              <path d="M0 -34C-19 -34 -34 -19.6 -34 -1.4C-34 25 0 54 0 54C0 54 34 25 34 -1.4C34 -19.6 19 -34 0 -34Z" fill="#F74211" />
              <circle cx="-8" cy="-8" r="18" fill="#14171C" />
              <circle cx="-13" cy="-11" r="2.2" fill="#F3F1EA" />
              <circle cx="-3" cy="-11" r="2.2" fill="#F3F1EA" />
              <path d="M-16 -2c3 4 10 4 13 0" stroke="#F3F1EA" strokeWidth="2" strokeLinecap="round" fill="none" />
            </g>

            {/* Rating label */}
            <rect x="672" y="196" width="150" height="30" rx="5" fill="#14171C" stroke="rgba(255,255,255,0.16)" />
            <text x="684" y="216" fill="#F3F1EA" fontFamily="var(--font-ibm-plex-mono), monospace" fontSize="12">4.8 ★ · a 6 min</text>
          </svg>

          {/* Live badge */}
          <div
            className="tgo-live-badge"
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 200,
              background: 'rgba(20,23,28,0.86)',
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--tgo-line-on-ink)',
              borderRadius: 10,
              padding: '16px 16px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 600, color: 'var(--tgo-go)', letterSpacing: '0.02em' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--tgo-go)',
                  animation: 'tgo-pulse 1.8s infinite',
                  display: 'inline-block',
                }}
              />
              EN TU ZONA · AHORA
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 10px', marginTop: 12 }}>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 22,
                    fontWeight: 600,
                    color: 'var(--tgo-text-on-ink)',
                    lineHeight: 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {openCount}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--tgo-text-on-ink-soft)', marginTop: 4, lineHeight: 1.3 }}>
                  abiertos ahora
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 22,
                    fontWeight: 600,
                    color: 'var(--tgo-text-on-ink)',
                    lineHeight: 1,
                  }}
                >
                  20
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--tgo-text-on-ink-soft)', marginTop: 4, lineHeight: 1.3 }}>
                  promos activas
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 22,
                    fontWeight: 600,
                    color: 'var(--tgo-text-on-ink)',
                    lineHeight: 1,
                  }}
                >
                  04
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--tgo-text-on-ink-soft)', marginTop: 4, lineHeight: 1.3 }}>
                  nuevos esta semana
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 22,
                    fontWeight: 600,
                    color: 'var(--tgo-text-on-ink)',
                    lineHeight: 1,
                  }}
                >
                  20′
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--tgo-text-on-ink-soft)', marginTop: 4, lineHeight: 1.3 }}>
                  espera promedio
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 9,
                color: 'var(--tgo-text-on-ink-soft)',
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid var(--tgo-line-on-ink)',
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
              }}
            >
              {updatedAt}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .tgo-live-badge {
            position: static !important;
            width: 100% !important;
            margin-top: 16px !important;
          }
          .tgo-live-badge > div:nth-child(2) {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
      `}</style>
    </header>
  )
}
