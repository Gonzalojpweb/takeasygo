'use client'

export default function PosReturnBar() {
  const handleReturn = () => {
    if (window.opener) {
      window.opener.focus()
      window.close()
    } else {
      window.history.back()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        backgroundColor: '#1a1a1a',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontFamily: 'var(--font-family, system-ui, sans-serif)',
        fontSize: '13px',
        zIndex: 9999,
        borderBottom: '1px solid #333',
      }}
    >
      <span style={{ opacity: 0.8 }}>Accedido desde el POS</span>
      <button
        onClick={handleReturn}
        style={{
          background: '#f74211',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 14px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        ← Volver al POS
      </button>
    </div>
  )
}
