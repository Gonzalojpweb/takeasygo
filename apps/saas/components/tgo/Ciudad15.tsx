'use client'

export default function Ciudad15() {
  return (
    <section id="ciudad" style={{ padding: '88px 0', overflow: 'hidden' }}>
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '0 28px',
          display: 'grid',
          gridTemplateColumns: '0.9fr 1.1fr',
          gap: 60,
          alignItems: 'center',
        }}
        className="tgo-two-col"
      >
        {/* Radar — static SVG */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 400,
            aspectRatio: '1',
            margin: '0 auto',
            overflow: 'hidden',
          }}
        >
          <svg viewBox="0 0 400 400" fill="none" style={{ width: '100%', height: '100%' }}>
            {/* Concentric circles */}
            <circle cx="200" cy="200" r="190" stroke="#C9C3AF" strokeWidth="1" />
            <circle cx="200" cy="200" r="128" stroke="#C9C3AF" strokeWidth="1" />
            <circle cx="200" cy="200" r="66" fill="#F9E4DC" stroke="#F74211" strokeWidth="1.5" />

            {/* Center pin */}
            <g transform="translate(200,200)">
              <circle r="22" fill="#F74211" />
              <circle r="14" fill="#fff" />
              <circle cx="-4" cy="-2" r="1.8" fill="#14171C" />
              <circle cx="4" cy="-2" r="1.8" fill="#14171C" />
              <path d="M-5 4c2.5 3 7.5 3 10 0" stroke="#14171C" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            </g>

            {/* Category icons — static positions on circles */}
            {/* Top — Sandwich icon (r=190 ring) */}
            <g transform="translate(200,60)">
              <rect x="-18" y="-18" width="36" height="36" rx="7" fill="#fff" stroke="#C9C3AF" />
              <path d="M-8 4h16M-8 4c0-5 2.5-9 8-9s8 4 8 9M-8 -2h16" stroke="#14171C" strokeWidth="1.6" strokeLinecap="round" fill="none" transform="translate(0,3)" />
            </g>

            {/* Right — Coffee icon (r=128 ring) */}
            <g transform="translate(328,160)">
              <rect x="-18" y="-18" width="36" height="36" rx="7" fill="#fff" stroke="#C9C3AF" />
              <ellipse cx="0" cy="2" rx="9" ry="6" stroke="#14171C" strokeWidth="1.6" fill="none" />
              <path d="M-8 -2h16" stroke="#14171C" strokeWidth="1.6" />
            </g>

            {/* Left — Cup icon (r=128 ring) */}
            <g transform="translate(72,170)">
              <rect x="-18" y="-18" width="36" height="36" rx="7" fill="#fff" stroke="#C9C3AF" />
              <path d="M-9 8c0-8 3.5-14 9-14s9 6 9 14" stroke="#14171C" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path d="M-10 8h20" stroke="#14171C" strokeWidth="1.6" strokeLinecap="round" />
            </g>

            {/* Bottom — Egg/dish icon (r=190 ring) */}
            <g transform="translate(280,330)">
              <rect x="-18" y="-18" width="36" height="36" rx="7" fill="#fff" stroke="#C9C3AF" />
              <ellipse cx="0" cy="0" rx="10" ry="5.5" stroke="#14171C" strokeWidth="1.6" fill="none" />
            </g>
          </svg>

          {/* "15 min a pie" badge */}
          <div
            style={{
              position: 'absolute',
              bottom: '8%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--tgo-ink)',
              color: 'var(--tgo-text-on-ink)',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: 11,
              fontWeight: 600,
              padding: '6px 10px',
              borderRadius: 5,
              whiteSpace: 'nowrap',
            }}
          >
            15 min a pie
          </div>
        </div>

        {/* Copy */}
        <div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--tgo-signal)',
              marginBottom: 10,
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            LA IDEA
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-big-shoulders), sans-serif',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              lineHeight: 0.94,
              fontSize: 'clamp(30px, 4vw, 46px)',
            }}
          >
            Un barrio que resuelve tu día, no un algoritmo que decide por vos.
          </h2>
          <p
            style={{
              fontSize: 15.5,
              color: 'var(--tgo-text-on-paper-soft)',
              lineHeight: 1.7,
              marginTop: 6,
              maxWidth: 480,
            }}
          >
            La ciudad de los 15 minutos es un principio de planificación urbana: todo lo que necesitás debería estar a una caminata corta. TGO aplica esa misma lógica a la comida — te muestra lo que está cerca de verdad, no lo que paga más por aparecer primero.
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .tgo-two-col {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </section>
  )
}
