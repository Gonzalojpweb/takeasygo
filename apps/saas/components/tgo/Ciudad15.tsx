export default function Ciudad15() {
  return (
    <section id="ciudad" style={{ padding: '88px 0' }}>
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
        {/* Radar */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 400, aspectRatio: '1', margin: '0 auto' }}>
          <svg viewBox="0 0 400 400" fill="none" style={{ width: '100%', height: '100%' }}>
            <circle cx="200" cy="200" r="190" stroke="#C9C3AF" strokeWidth="1" />
            <circle cx="200" cy="200" r="128" stroke="#C9C3AF" strokeWidth="1" />
            <circle cx="200" cy="200" r="66" fill="#F9E4DC" stroke="#F74211" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="20" fill="#F74211" />

            {/* Category icons */}
            <g transform="translate(200,78)">
              <rect x="-20" y="-20" width="40" height="40" rx="8" fill="#fff" stroke="#C9C3AF" />
              <path d="M-9 4h18M-9 4c0-6 3-11 9-11s9 5 9 11M-9 -3h18" stroke="#14171C" strokeWidth="1.8" strokeLinecap="round" fill="none" transform="translate(0,4)" />
            </g>
            <g transform="translate(330,140)">
              <rect x="-20" y="-20" width="40" height="40" rx="8" fill="#fff" stroke="#C9C3AF" />
              <ellipse cx="0" cy="2" rx="10" ry="7" stroke="#14171C" strokeWidth="1.8" fill="none" />
              <path d="M-9 -2h18" stroke="#14171C" strokeWidth="1.8" />
            </g>
            <g transform="translate(70,150)">
              <rect x="-20" y="-20" width="40" height="40" rx="8" fill="#fff" stroke="#C9C3AF" />
              <path d="M-10 8c0-9 4-16 10-16s10 7 10 16" stroke="#14171C" strokeWidth="1.8" fill="none" strokeLinecap="round" />
              <path d="M-11 8h22" stroke="#14171C" strokeWidth="1.8" strokeLinecap="round" />
            </g>
            <g transform="translate(280,318)">
              <rect x="-20" y="-20" width="40" height="40" rx="8" fill="#fff" stroke="#C9C3AF" />
              <ellipse cx="0" cy="0" rx="11" ry="6" stroke="#14171C" strokeWidth="1.8" fill="none" />
            </g>
          </svg>

          <div
            style={{
              position: 'absolute',
              bottom: '6%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--tgo-ink)',
              color: 'var(--tgo-text-on-ink)',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: 11,
              padding: '6px 9px',
              borderRadius: 5,
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
          .tgo-two-col { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  )
}
