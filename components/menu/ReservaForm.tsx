'use client'

import { useState } from 'react'

interface Props {
  tenant: any
  location: any
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function ReservaForm({ tenant, location }: Props) {
  const branding = tenant.branding
  const config = location.reservationConfig || {}
  const timeSlots: string[] = config.timeSlots || []
  const minPayment: number = config.minPayment || 0
  const maxPartySize: number = config.maxPartySize || 10

  const [step, setStep] = useState<'form' | 'paying' | 'free_done'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    date: getTodayStr(),
    time: timeSlots[0] || '',
    partySize: 2,
    name: '',
    phone: '',
    notes: '',
  })

  const br = branding.borderRadius === 'pill' ? '9999px' : branding.borderRadius === 'sharp' ? '4px' : '12px'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.time) { setError('Seleccioná un horario'); return }
    if (!form.name.trim()) { setError('Ingresá tu nombre'); return }
    if (!form.phone.trim()) { setError('Ingresá tu teléfono'); return }

    setLoading(true)
    try {
      // 1. Create reservation
      const resRes = await fetch(`/api/${tenant.slug}/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, locationId: location._id }),
      })
      if (!resRes.ok) {
        const d = await resRes.json()
        setError(d.error || 'Error al crear la reserva')
        return
      }
      const { reservation } = await resRes.json()

      // 2. Create MP preference
      const prefRes = await fetch(`/api/${tenant.slug}/reservas/preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservaId: reservation._id }),
      })
      if (!prefRes.ok) {
        setError('Error al iniciar el pago')
        return
      }
      const prefData = await prefRes.json()

      if (prefData.free) {
        // No payment needed
        setStep('free_done')
        return
      }

      // 3. Redirect to MP
      const url = process.env.NODE_ENV === 'production'
        ? prefData.initPoint
        : (prefData.sandboxInitPoint || prefData.initPoint)
      window.location.href = url
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: br,
    border: `1.5px solid ${branding.primaryColor}30`,
    backgroundColor: '#ffffff',
    color: branding.textColor,
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.15em',
    color: branding.textColor,
    opacity: 0.5,
    marginBottom: '6px',
  }

  if (step === 'free_done') {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: branding.backgroundColor, color: branding.textColor, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: branding.primaryColor + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={branding.primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>¡Reserva confirmada!</h2>
          <p style={{ opacity: 0.6, fontSize: '14px' }}>Nos vemos pronto. Podés comunicarte al {location.phone} si necesitás modificar tu reserva.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: branding.backgroundColor, color: branding.textColor, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ padding: '32px 20px 0', textAlign: 'center' }}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={tenant.name} style={{ height: 52, objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
        ) : (
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: branding.primaryColor, marginBottom: '8px' }}>{tenant.name}</h1>
        )}
        <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Reservar mesa</p>
        <p style={{ fontSize: '12px', opacity: 0.5 }}>{location.name}</p>
        {minPayment > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '5px 14px', borderRadius: 9999, backgroundColor: branding.primaryColor + '15', border: `1px solid ${branding.primaryColor}30` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={branding.primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: '11px', fontWeight: 700, color: branding.primaryColor }}>
              Seña de ${minPayment.toLocaleString('es-AR')} para confirmar
            </span>
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ maxWidth: '420px', margin: '0 auto', padding: '28px 20px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Date */}
          <div>
            <label style={labelStyle}>Fecha</label>
            <input
              type="date"
              value={form.date}
              min={getTodayStr()}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={inputStyle}
              required
            />
          </div>

          {/* Time slots */}
          <div>
            <label style={labelStyle}>Horario</label>
            {timeSlots.length === 0 ? (
              <p style={{ fontSize: '13px', opacity: 0.5 }}>No hay horarios configurados</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {timeSlots.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, time: slot }))}
                    style={{
                      padding: '8px 16px',
                      borderRadius: br,
                      border: `1.5px solid ${branding.primaryColor}`,
                      backgroundColor: form.time === slot ? branding.primaryColor : 'transparent',
                      color: form.time === slot ? '#ffffff' : branding.primaryColor,
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Party size */}
          <div>
            <label style={labelStyle}>Personas</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PARTY_SIZES.filter(s => s <= maxPartySize).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, partySize: s }))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: br,
                    border: `1.5px solid ${branding.primaryColor}`,
                    backgroundColor: form.partySize === s ? branding.primaryColor : 'transparent',
                    color: form.partySize === s ? '#ffffff' : branding.primaryColor,
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Tu nombre"
              style={inputStyle}
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label style={labelStyle}>Teléfono</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+54 9 11 1234 5678"
              style={inputStyle}
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Observaciones (opcional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Ej: Mesa afuera, celebración de cumpleaños, alergias..."
              rows={3}
              style={{ ...inputStyle, resize: 'none', height: 80 }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '13px', color: '#ef4444', textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || timeSlots.length === 0}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: br,
              border: 'none',
              backgroundColor: branding.primaryColor,
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: `0 8px 24px ${branding.primaryColor}44`,
            }}
          >
            {loading ? 'Procesando...' : minPayment > 0 ? `Pagar seña $${minPayment.toLocaleString('es-AR')}` : 'Confirmar reserva'}
          </button>
        </div>
      </form>
    </div>
  )
}
