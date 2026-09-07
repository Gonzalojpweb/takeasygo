import Link from 'next/link'

export default function Restaurantes() {
  return (
    <section id="restaurantes" style={{ paddingTop: 0, paddingBottom: 88 }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            flexWrap: 'wrap',
            background: 'var(--tgo-ink)',
            borderRadius: 16,
            padding: '40px 44px',
            color: 'var(--tgo-text-on-ink)',
          }}
        >
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-big-shoulders), sans-serif',
                fontWeight: 800,
                fontSize: 24,
              }}
            >
              ¿Tenés un local gastronómico?
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--tgo-text-on-ink-soft)', marginTop: 6 }}>
              Sumate a la red y dejá que tu consistencia hable por vos.
            </p>
          </div>
          <Link
            href="#"
            className="tgo-rest-btn"
            style={{
              background: 'transparent',
              border: '1px solid var(--tgo-line-on-ink)',
              color: 'var(--tgo-text-on-ink)',
              padding: '12px 22px',
              borderRadius: 8,
              fontSize: 13.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Sumar mi local
          </Link>
        </div>
      </div>
    </section>
  )
}
