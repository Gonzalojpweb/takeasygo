export default function TickerStats() {
  const stats = [
    { number: '4.2K', label: 'pedidos esta semana' },
    { number: '18 min', label: 'tiempo promedio de entrega' },
    { number: '96%', label: 'entregas a tiempo' },
    { number: '4.8', label: 'rating promedio' },
  ]

  return (
    <section
      style={{
        background: 'var(--tgo-ink-soft)',
        borderTop: '1px solid var(--tgo-line-on-ink)',
        borderBottom: '1px solid var(--tgo-line-on-ink)',
        padding: 0,
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '0 28px',
          display: 'flex',
        }}
        className="tgo-ticker-row"
      >
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              padding: '36px 24px',
              borderRight: i < stats.length - 1 ? '1px solid var(--tgo-line-on-ink)' : 'none',
            }}
            className="tgo-ticker-item"
          >
            <div
              style={{
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                fontSize: 34,
                fontWeight: 600,
                color: 'var(--tgo-text-on-ink)',
                lineHeight: 1,
              }}
            >
              {stat.number}
            </div>
            <div style={{ fontSize: 12, color: 'var(--tgo-text-on-ink-soft)', marginTop: 6 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 700px) {
          .tgo-ticker-row { flex-wrap: wrap !important; }
          .tgo-ticker-item { flex: 1 1 50% !important; border-right: none !important; border-bottom: 1px solid var(--tgo-line-on-ink); }
        }
      `}</style>
    </section>
  )
}
