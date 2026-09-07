export default function Faces() {
  const faces = [
    {
      title: 'Activo',
      desc: 'Operando y recibiendo pedidos ahora mismo.',
      svg: (
        <svg viewBox="0 0 64 78" width={56} height={68} fill="none">
          <path d="M32 2C15 2 2 15.6 2 32.6C2 54 32 76 32 76C32 76 62 54 62 32.6C62 15.6 49 2 32 2Z" fill="#F74211" />
          <circle cx="32" cy="30" r="19" fill="#fff" />
          <circle cx="25" cy="27" r="2.4" fill="#14171C" />
          <circle cx="39" cy="27" r="2.4" fill="#14171C" />
          <path d="M23 35c4 5 14 5 18 0" stroke="#14171C" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </svg>
      ),
    },
    {
      title: 'Descansando',
      desc: 'Fuera de horario — el ritmo natural del barrio.',
      svg: (
        <svg viewBox="0 0 64 78" width={56} height={68} fill="none">
          <path d="M32 2C15 2 2 15.6 2 32.6C2 54 32 76 32 76C32 76 62 54 62 32.6C62 15.6 49 2 32 2Z" fill="#9A9284" />
          <circle cx="32" cy="30" r="19" fill="#fff" />
          <path d="M22 27c2-2 5-2 7 0" stroke="#565149" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M35 27c2-2 5-2 7 0" stroke="#565149" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M25 37c4 2 10 2 14 0" stroke="#565149" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
      ),
    },
    {
      title: 'Con guiño',
      desc: 'Tiene una oferta activa — vale la pena mirar.',
      svg: (
        <svg viewBox="0 0 64 78" width={56} height={68} fill="none">
          <path d="M32 6C17.9 6 6 18.4 6 33C6 51.8 32 71.5 32 71.5C32 71.5 58 51.8 58 33C58 18.4 46.1 6 32 6Z" fill="#F74211" />
          <circle cx="32" cy="31" r="18" fill="#fff" />
          <path d="M22 28c2-2 5-2 7 0" stroke="#14171C" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="39" cy="28" r="2.2" fill="#14171C" />
          <path d="M24 36c3 4 12 4 15 0" stroke="#14171C" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
      ),
    },
  ]

  return (
    <section id="vivo" style={{ padding: '88px 0', background: 'var(--tgo-paper-alt)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
        <div style={{ maxWidth: 600, marginBottom: 52 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--tgo-signal)',
              marginBottom: 10,
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            EN TIEMPO REAL
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-big-shoulders), sans-serif',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              lineHeight: 0.94,
              fontSize: 'clamp(28px, 3.6vw, 44px)',
            }}
          >
            Cada local vive en el mapa como una cara.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--tgo-text-on-paper-soft)', marginTop: 16, lineHeight: 1.65 }}>
            Tres expresiones, nada más — lo justo para saber qué está pasando ahora, sin leer una palabra.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            background: 'var(--tgo-line-on-paper)',
            border: '1px solid var(--tgo-line-on-paper)',
            marginTop: 8,
          }}
          className="tgo-faces-row"
        >
          {faces.map((face) => (
            <div
              key={face.title}
              style={{
                background: 'var(--tgo-paper-alt)',
                padding: '36px 28px',
              }}
            >
              <div style={{ marginBottom: 20 }}>{face.svg}</div>
              <div
                style={{
                  fontFamily: 'var(--font-big-shoulders), sans-serif',
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {face.title}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: 'var(--tgo-text-on-paper-soft)',
                  marginTop: 8,
                  lineHeight: 1.55,
                }}
              >
                {face.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .tgo-faces-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
