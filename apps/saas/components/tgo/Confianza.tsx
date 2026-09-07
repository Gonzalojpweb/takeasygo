export default function Confianza() {
  const tiers = [
    {
      name: 'En formación',
      desc: 'Recién empieza',
      barWidth: '20%',
      barColor: 'var(--tgo-signal)',
      pinColor: '#3A3F49',
      face: (
        <>
          <circle cx="32" cy="30" r="19" fill="#F3F1EA" />
          <circle cx="25" cy="27" r="2" fill="#14171C" />
          <circle cx="39" cy="27" r="2" fill="#14171C" />
          <path d="M25 37h14" stroke="#14171C" strokeWidth="2.4" strokeLinecap="round" />
        </>
      ),
    },
    {
      name: 'Consolidando',
      desc: 'Ganando ritmo',
      barWidth: '50%',
      barColor: '#FAB300',
      pinColor: '#5A4530',
      face: (
        <>
          <circle cx="32" cy="31" r="18" fill="#F3F1EA" />
          <circle cx="25" cy="28" r="2.2" fill="#14171C" />
          <circle cx="39" cy="28" r="2.2" fill="#14171C" />
          <path d="M24 37c4 3 12 3 16 0" stroke="#14171C" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </>
      ),
    },
    {
      name: 'Confiable',
      desc: 'Consistencia real',
      barWidth: '78%',
      barColor: '#2FBF71',
      pinColor: '#1F4D3A',
      face: (
        <>
          <circle cx="32" cy="31" r="18" fill="#F3F1EA" />
          <circle cx="25" cy="28" r="2.2" fill="#14171C" />
          <circle cx="39" cy="28" r="2.2" fill="#14171C" />
          <path d="M23 36c4 5 14 5 18 0" stroke="#14171C" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </>
      ),
    },
    {
      name: 'Referente',
      desc: 'El mejor de su zona',
      barWidth: '100%',
      barColor: 'var(--tgo-signal)',
      pinColor: '#F74211',
      face: (
        <>
          <circle cx="32" cy="31" r="18" fill="#F3F1EA" />
          <circle cx="24" cy="27" r="2.4" fill="#14171C" />
          <circle cx="40" cy="27" r="2.4" fill="#14171C" />
          <path d="M22 36c5 6 15 6 20 0" stroke="#14171C" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          <path d="M14 20l4 4M50 20l-4 4M16 44l3-4M48 44l-3-4" stroke="#F74211" strokeWidth="2" strokeLinecap="round" />
        </>
      ),
    },
  ]

  return (
    <section id="confianza" style={{ padding: '88px 0', background: 'var(--tgo-ink)', color: 'var(--tgo-text-on-ink)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
        <div style={{ maxWidth: 600, marginBottom: 52 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: '#FAB300',
              marginBottom: 10,
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            ÍNDICE DE CONSISTENCIA OPERATIVA
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-big-shoulders), sans-serif',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              lineHeight: 0.94,
              fontSize: 'clamp(30px, 4.4vw, 52px)',
              color: 'var(--tgo-text-on-ink)',
            }}
          >
            Confianza que se ve, no que se promete.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--tgo-text-on-ink-soft)', marginTop: 16, lineHeight: 1.65 }}>
            Nada de rating comprado. El anillo se gana con tiempo de entrega cumplido y pedidos sin cancelar. Cuanto más consistente, más sube de nivel.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 1,
            background: 'var(--tgo-line-on-ink)',
            border: '1px solid var(--tgo-line-on-ink)',
            marginTop: 12,
          }}
          className="tgo-ring-tiers"
        >
          {tiers.map((tier) => (
            <div
              key={tier.name}
              style={{
                background: 'var(--tgo-ink)',
                padding: '30px 20px',
                textAlign: 'left',
              }}
            >
              <svg viewBox="0 0 64 78" width={44} height={54} fill="none" style={{ marginBottom: 16 }}>
                <path
                  d="M32 2C15 2 2 15.6 2 32.6C2 54 32 76 32 76C32 76 62 54 62 32.6C62 15.6 49 2 32 2Z"
                  fill={tier.pinColor}
                />
                {tier.face}
              </svg>
              <div
                style={{
                  fontFamily: 'var(--font-big-shoulders), sans-serif',
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                {tier.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--tgo-text-on-ink-soft)', marginTop: 4 }}>
                {tier.desc}
              </div>
              <div
                style={{
                  height: 3,
                  background: 'var(--tgo-line-on-ink)',
                  marginTop: 14,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: tier.barWidth,
                    background: tier.barColor,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .tgo-ring-tiers { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </section>
  )
}
