import Link from 'next/link'

export default function FinalCta() {
  return (
    <section
      id="descargar"
      style={{
        background: 'var(--tgo-signal)',
        borderRadius: 16,
        margin: '0 28px',
        padding: '96px 32px',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <h2
          style={{
            fontFamily: 'var(--font-big-shoulders), sans-serif',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            lineHeight: 0.94,
            fontSize: 'clamp(38px, 6vw, 68px)',
            color: '#fff',
            maxWidth: 760,
            margin: '0 auto',
          }}
        >
          Tu barrio ya te está esperando.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 18, maxWidth: 460, margin: '18px auto 0' }}>
          Instalá TGO y descubrí todo lo que tenés a 15 minutos, hoy.
        </p>

        <Link
          href="/app"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: '#fff',
            color: 'var(--tgo-signal)',
            border: 'none',
            fontFamily: 'var(--font-ibm-plex-sans), sans-serif',
            fontSize: 15.5,
            fontWeight: 700,
            padding: '16px 26px',
            borderRadius: 8,
            cursor: 'pointer',
            marginTop: 32,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v13M7 11l5 5 5-5M5 21h14" stroke="#F74211" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Instalar TGO ahora
        </Link>

        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 14 }}>
          <strong style={{ color: '#fff' }}>Próximamente</strong> en App Store y Google Play
        </div>
      </div>
    </section>
  )
}
