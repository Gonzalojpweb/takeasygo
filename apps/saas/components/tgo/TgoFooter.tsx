export default function TgoFooter() {
  return (
    <footer
      style={{
        background: 'var(--tgo-ink)',
        color: 'var(--tgo-text-on-ink-soft)',
        padding: '44px 0',
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '0 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, color: 'var(--tgo-text-on-ink-soft)' }}>
          <svg viewBox="0 0 64 64" width={20} fill="none">
            <circle cx="32" cy="32" r="30" stroke="#F74211" strokeWidth="2.5" strokeDasharray="3 5" />
            <circle cx="32" cy="32" r="21" fill="#F74211" />
            <circle cx="26" cy="29" r="2.4" fill="#14171C" />
            <circle cx="38" cy="29" r="2.4" fill="#14171C" />
            <path d="M24 37c4 5 12 5 16 0" stroke="#14171C" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </svg>
          <span style={{ fontFamily: 'var(--font-big-shoulders), sans-serif', fontWeight: 800 }}>TGO</span>
        </div>

        <div className="tgo-footer-links" style={{ display: 'flex', gap: 26, fontSize: 13 }}>
          <a href="#">Términos</a>
          <a href="#">Privacidad</a>
          <a href="#">Ayuda</a>
        </div>

        <div style={{ fontSize: 12 }}>© 2026 TakeasyGO — Buenos Aires</div>
      </div>
    </footer>
  )
}
