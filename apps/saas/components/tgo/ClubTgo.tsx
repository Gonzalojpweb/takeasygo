import Link from 'next/link'

export default function ClubTgo() {
  return (
    <section style={{ padding: '88px 0' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
        <div
          style={{
            background: 'var(--tgo-violet)',
            borderRadius: 16,
            padding: 56,
            color: '#fff',
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: 40,
            alignItems: 'center',
            border: '1px solid rgba(255,255,255,0.14)',
          }}
          className="tgo-club-card"
        >
          <div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.7)',
                marginBottom: 10,
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
              }}
            >
              CLUB TGO
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-big-shoulders), sans-serif',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                lineHeight: 0.94,
                fontSize: 'clamp(28px, 3.4vw, 42px)',
                color: '#fff',
              }}
            >
              Cuanto más pedís, más se nota.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.78)', marginTop: 14, lineHeight: 1.6, fontSize: 15, maxWidth: 420 }}>
              Beneficios reales en los locales que más visitás — sin puntos que caducan sin avisar ni letra chica.
            </p>
            <Link
              href="#"
              style={{
                display: 'inline-block',
                marginTop: 24,
                background: '#fff',
                color: 'var(--tgo-violet)',
                fontWeight: 700,
                padding: '13px 24px',
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              Conocer el Club
            </Link>
            <div
              style={{
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                fontSize: 11,
                color: 'rgba(255,255,255,0.55)',
                marginTop: 20,
                letterSpacing: '0.04em',
              }}
            >
              MIEMBRO N.° 000000 — BARRIO SIN ASIGNAR
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <svg viewBox="0 0 64 78" width={130} fill="none">
              <circle cx="32" cy="34" r="30" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
              <path d="M32 8C17.9 8 6 20.4 6 35C6 53.8 32 73.5 32 73.5C32 73.5 58 53.8 58 35C58 20.4 46.1 8 32 8Z" fill="#fff" />
              <circle cx="32" cy="33" r="17" fill="#6C4CF0" />
              <circle cx="25" cy="30" r="2.2" fill="#fff" />
              <circle cx="39" cy="30" r="2.2" fill="#fff" />
              <path d="M23 38c4 5 14 5 18 0" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .tgo-club-card { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
