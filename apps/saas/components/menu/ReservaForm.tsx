'use client'

import { useState, useEffect, useRef } from 'react'
import { toPesos } from '@takeasygo/business/browser'
import {
  DEFAULT_MIN_ADVANCE_MINUTES,
  DEFAULT_TIMEZONE,
  getLocalDayAndMinutes,
  getTodayStrInTimezone,
  isSlotBookable,
  timeToMinutes,
} from '@/lib/restaurant-time'

interface SlotItem {
  time: string
  available: boolean
  /** Con espacios: comensales ocupados y capacidad (medidos en el espacio elegido). */
  currentReservations?: number
  maxReservations?: number
}

interface Props {
  tenant: any
  location: any
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

interface SpaceItem {
  _id: string
  name: string
  capacity: number
  enabled?: boolean
  blockedDates?: string[]
}

const UI = {
  es: {
    title: 'Reservar mesa',
    deposit: (amount: string) => `Seña de $${amount} para confirmar`,
    date: 'Fecha',
    space: 'Espacio',
    spaceCapacity: (n: number) => `hasta ${n} pers.`,
    spaceLeft: (n: number) => `quedan ${n}`,
    spacesHint: 'Elegí un espacio para ver los horarios disponibles',
    errSpace: 'Elegí un espacio para tu reserva',
    time: 'Horario',
    noSlots: 'No hay horarios configurados',
    slotUnavailable: 'No disponible',
    loadingSlots: 'Cargando horarios...',
    partySize: 'Personas',
    name: 'Nombre',
    namePlaceholder: 'Tu nombre',
    phone: 'Teléfono',
    phonePlaceholder: '+54 9 11 1234 5678',
    notes: 'Observaciones (opcional)',
    notesPlaceholder: 'Ej: Mesa afuera, celebración de cumpleaños, alergias...',
    submit: 'Confirmar reserva',
    submitPay: (amount: string) => `Pagar seña $${amount}`,
    processing: 'Procesando...',
    confirmed: '¡Reserva confirmada!',
    confirmedMsg: (phone: string) => `Nos vemos pronto. Podés comunicarte al ${phone} si necesitás modificar tu reserva.`,
    errTime: 'Seleccioná un horario',
    errName: 'Ingresá tu nombre',
    errPhone: 'Ingresá tu teléfono',
    errConnection: 'Error de conexión. Intentá de nuevo.',
    errPayment: 'Error al iniciar el pago',
    errCreate: 'Error al crear la reserva',
  },
  en: {
    title: 'Book a table',
    deposit: (amount: string) => `$${amount} deposit required to confirm`,
    date: 'Date',
    space: 'Space',
    spaceCapacity: (n: number) => `up to ${n} guests`,
    spaceLeft: (n: number) => `${n} left`,
    spacesHint: 'Pick a space to see available times',
    errSpace: 'Please select a space',
    time: 'Time',
    noSlots: 'No time slots available',
    slotUnavailable: 'Unavailable',
    loadingSlots: 'Loading times...',
    partySize: 'Party size',
    name: 'Name',
    namePlaceholder: 'Your name',
    phone: 'Phone',
    phonePlaceholder: '+54 9 11 1234 5678',
    notes: 'Notes (optional)',
    notesPlaceholder: 'E.g.: outdoor table, birthday celebration, allergies...',
    submit: 'Confirm reservation',
    submitPay: (amount: string) => `Pay deposit $${amount}`,
    processing: 'Processing...',
    confirmed: 'Reservation confirmed!',
    confirmedMsg: (phone: string) => `See you soon. You can reach us at ${phone} if you need to modify your reservation.`,
    errTime: 'Please select a time',
    errName: 'Please enter your name',
    errPhone: 'Please enter your phone number',
    errConnection: 'Connection error. Please try again.',
    errPayment: 'Error starting payment',
    errCreate: 'Error creating reservation',
  },
}

export default function ReservaForm({ tenant, location }: Props) {
  const branding = tenant.branding
  const config = location.reservationConfig || {}
  const timezone: string = location.timezone || DEFAULT_TIMEZONE
  const minAdvanceMinutes: number = config.minAdvanceMinutes ?? DEFAULT_MIN_ADVANCE_MINUTES
  const staticTimeSlots: string[] = config.timeSlots || []
  // Se cobra sólo si el admin dejó los pagos activos y hay seña > 0.
  const paymentsEnabled = config.paymentsEnabled !== false
  const minPayment: number = paymentsEnabled ? config.minPayment || 0 : 0
  const maxPartySize: number = config.maxPartySize || 10
  const useAutoSlots = config.slotConfig?.enabled && config.slotConfig?.operatingHours?.length > 0
  // Con espacios cargados el aforo lo decide el server, también en modo manual.
  const spaces: SpaceItem[] = Array.isArray(location.spaces) ? location.spaces : []
  const spacesMode = spaces.length > 0
  const useServerSlots: boolean = !!useAutoSlots || spacesMode

  const spaceBlockedOnDate = (s: SpaceItem, date: string) =>
    s.enabled === false || (s.blockedDates ?? []).includes(date)

  const [locale, setLocale] = useState<'es' | 'en'>('es')
  const [step, setStep] = useState<'form' | 'paying' | 'free_done'>('form')
  const [loading, setLoading] = useState(false)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [error, setError] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [doneSpaceName, setDoneSpaceName] = useState('')

  const [slots, setSlots] = useState<SlotItem[]>(
    useServerSlots ? [] : staticTimeSlots.map(t => ({ time: t, available: true }))
  )

  const [form, setForm] = useState({
    date: getTodayStrInTimezone(timezone),
    time: useServerSlots ? '' : (staticTimeSlots[0] || ''),
    partySize: 2,
    name: '',
    phone: '',
    email: '',
    notes: '',
  })

  // Si al cambiar la fecha el espacio elegido queda bloqueado/deshabilitado,
  // la selección se ignora y vuelve a pedirse.
  const selectedSpace = spaces.find(s => s._id === spaceId)
  const activeSpace =
    selectedSpace && !spaceBlockedOnDate(selectedSpace, form.date) ? selectedSpace : null
  const activeSpaceId = activeSpace?._id || ''

  const clientToken = typeof window !== 'undefined' ? localStorage.getItem('push_client_token') : null

  // El modo manual filtra por este ref: es un array que se recrea en cada
  // render y meterlo en las deps del efecto causaría un loop infinito.
  const staticSlotsRef = useRef(staticTimeSlots)
  staticSlotsRef.current = staticTimeSlots

  const refreshSlotsRef = useRef<(showLoading?: boolean) => Promise<void>>(async () => {})

  // Refresca los horarios: si el server los maneja (automático o con
  // espacios) los pide con la fecha y el tamaño del grupo; si no, filtra los
  // timeSlots por "ahora" en el timezone de la sede.
  // Corre al cambiar la fecha o el grupo y después cada minuto, para que un
  // formulario abierto un rato no siga ofreciendo horarios que ya pasaron.
  useEffect(() => {
    let cancelled = false

    async function refreshSlots(showLoading = true) {
      if (useServerSlots) {
        // Con espacios la disponibilidad es la del espacio elegido: sin elección
        // todavía no hay horarios que mostrar.
        if (spacesMode && !activeSpaceId) {
          setSlots([])
          setSlotsLoading(false)
          setForm(f => (f.time ? { ...f, time: '' } : f))
          return
        }
        if (showLoading) setSlotsLoading(true)
        try {
          const url =
            `/api/${tenant.slug}/locations/${location._id}/reservation-slots` +
            `?date=${form.date}&partySize=${form.partySize}` +
            (activeSpaceId ? `&spaceId=${activeSpaceId}` : '')
          const res = await fetch(url)
          if (!res.ok) return
          const data = await res.json()
          if (cancelled) return
          const list: SlotItem[] = data.slots || []
          setSlots(list)
          // Reset selected time if no longer available
          setForm(f => (
            list.some(s => s.time === f.time && s.available)
              ? f
              : { ...f, time: list.find(s => s.available)?.time || '' }
          ))
        } catch {
          // ignore
        } finally {
          if (showLoading && !cancelled) setSlotsLoading(false)
        }
        return
      }

      const todayStr = getTodayStrInTimezone(timezone)
      const isToday = form.date === todayStr
      const nowMinutes = isToday ? getLocalDayAndMinutes(new Date(), timezone).minutes : -1
      const visible = form.date < todayStr
        ? []
        : staticSlotsRef.current.filter(
            t => !isToday || isSlotBookable(timeToMinutes(t), nowMinutes, minAdvanceMinutes)
          )
      if (cancelled) return
      setSlots(visible.map(time => ({ time, available: true })))
      setForm(f => (
        f.time && !visible.includes(f.time) ? { ...f, time: visible[0] || '' } : f
      ))
    }

    refreshSlotsRef.current = refreshSlots
    refreshSlots()
    const interval = setInterval(() => { refreshSlots(false) }, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [form.date, form.partySize, useServerSlots, spacesMode, activeSpaceId, tenant.slug, location._id, timezone, minAdvanceMinutes])

  const t = UI[locale]
  const primary = branding.primaryColor
  const br = branding.borderRadius === 'pill' ? '9999px' : branding.borderRadius === 'sharp' ? '4px' : '12px'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (spacesMode && !activeSpaceId) { setError(t.errSpace); return }
    if (!form.time) { setError(t.errTime); return }
    if (!form.name.trim()) { setError(t.errName); return }
    if (!form.phone.trim()) { setError(t.errPhone); return }

    setLoading(true)
    try {
      // 1. Create reservation
      const resRes = await fetch(`/api/${tenant.slug}/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          locationId: location._id,
          clientToken: clientToken || undefined,
          spaceId: activeSpaceId || undefined,
        }),
      })
      if (!resRes.ok) {
        const d = await resRes.json()
        // 409 = el horario dejó de estar disponible (lo ocuparon o pasó):
        // refrescamos los slots para que el form no siga ofreciendo ese.
        if (resRes.status === 409) await refreshSlotsRef.current()
        setError(d.error || t.errCreate)
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
        setError(t.errPayment)
        return
      }
      const prefData = await prefRes.json()

      if (prefData.free) {
        // No payment needed
        setDoneSpaceName(activeSpace?.name || '')
        setStep('free_done')
        return
      }

      // 3. Redirect to MP
      const url = process.env.NODE_ENV === 'production'
        ? prefData.initPoint
        : (prefData.sandboxInitPoint || prefData.initPoint)
      window.location.href = url
    } catch {
      setError(t.errConnection)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: br,
    border: `1.5px solid ${primary}30`,
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
          <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: primary + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>{t.confirmed}</h2>
          <p style={{ opacity: 0.6, fontSize: '14px' }}>{t.confirmedMsg(location.phone)}</p>
          {doneSpaceName && (
            <p style={{ fontSize: '14px', fontWeight: 700, marginTop: '12px', color: primary }}>
              {t.space}: {doneSpaceName}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: branding.backgroundColor, color: branding.textColor, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ padding: '32px 20px 0', textAlign: 'center' }}>
        {/* Language toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 4, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
            <button
              onClick={() => setLocale('es')}
              style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: primary, opacity: locale === 'es' ? 1 : 0.35 }}>
              ES
            </button>
            <span style={{ opacity: 0.25, color: branding.textColor }}>|</span>
            <button
              onClick={() => setLocale('en')}
              style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: primary, opacity: locale === 'en' ? 1 : 0.35 }}>
              EN
            </button>
          </div>
        </div>

        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={tenant.name} style={{ height: 52, objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
        ) : (
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: primary, marginBottom: '8px' }}>{tenant.name}</h1>
        )}
        <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{t.title}</p>
        <p style={{ fontSize: '12px', opacity: 0.5 }}>{location.name}</p>
        {minPayment > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '5px 14px', borderRadius: 9999, backgroundColor: primary + '15', border: `1px solid ${primary}30` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: '11px', fontWeight: 700, color: primary }}>
              {t.deposit(toPesos(minPayment).toLocaleString('es-AR'))}
            </span>
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ maxWidth: '420px', margin: '0 auto', padding: '28px 20px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Date */}
          <div>
            <label style={labelStyle}>{t.date}</label>
            <input
              type="date"
              value={form.date}
              min={getTodayStrInTimezone(timezone)}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={inputStyle}
              required
            />
          </div>

          {/* Space (obligatorio cuando la sede tiene espacios) */}
          {spacesMode && (
            <div>
              <label style={labelStyle}>{t.space}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {spaces.map(s => {
                  const blocked = spaceBlockedOnDate(s, form.date)
                  const selected = s._id === activeSpaceId
                  return (
                    <button
                      key={s._id}
                      type="button"
                      disabled={blocked}
                      onClick={() => {
                        setSpaceId(s._id)
                        // Si el grupo no entra en el espacio elegido, se achica.
                        setForm(f =>
                          f.partySize > s.capacity ? { ...f, partySize: s.capacity } : f
                        )
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: br,
                        border: `1.5px solid ${selected ? primary : primary}40`,
                        backgroundColor: blocked ? '#f5f5f5' : selected ? primary : 'transparent',
                        color: blocked ? '#ccc' : selected ? '#ffffff' : primary,
                        fontSize: '13px',
                        fontWeight: 700,
                        textAlign: 'left',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                        opacity: blocked ? 0.6 : 1,
                      }}
                    >
                      {s.name}
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, opacity: 0.75 }}>
                        {t.spaceCapacity(s.capacity)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Time slots */}
          <div>
            <label style={labelStyle}>{t.time}</label>
            {slotsLoading ? (
              <p style={{ fontSize: '13px', opacity: 0.5 }}>{t.loadingSlots}</p>
            ) : slots.length === 0 ? (
              <p style={{ fontSize: '13px', opacity: 0.5 }}>
                {spacesMode && !activeSpaceId ? t.spacesHint : t.noSlots}
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {slots.map(slot => {
                  const left =
                    typeof slot.maxReservations === 'number' && typeof slot.currentReservations === 'number'
                      ? Math.max(0, slot.maxReservations - slot.currentReservations)
                      : null
                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => slot.available && setForm(f => ({ ...f, time: slot.time }))}
                      style={{
                        padding: slot.available && spacesMode && left !== null ? '6px 14px' : '8px 16px',
                        borderRadius: br,
                        border: `1.5px solid ${form.time === slot.time ? primary : primary}40`,
                        backgroundColor: !slot.available ? '#f5f5f5' : form.time === slot.time ? primary : 'transparent',
                        color: !slot.available ? '#ccc' : form.time === slot.time ? '#ffffff' : primary,
                        fontSize: '13px',
                        fontWeight: 700,
                        textAlign: 'center',
                        cursor: slot.available ? 'pointer' : 'not-allowed',
                        opacity: !slot.available ? 0.5 : 1,
                        textDecoration: !slot.available ? 'line-through' : 'none',
                      }}
                    >
                      {slot.time}
                      {slot.available && spacesMode && left !== null && (
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 600, opacity: 0.75 }}>
                          {t.spaceLeft(left)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Party size */}
          <div>
            <label style={labelStyle}>{t.partySize}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PARTY_SIZES.filter(
                s => s <= maxPartySize && (!activeSpace || s <= activeSpace.capacity)
              ).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, partySize: s }))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: br,
                    border: `1.5px solid ${primary}`,
                    backgroundColor: form.partySize === s ? primary : 'transparent',
                    color: form.partySize === s ? '#ffffff' : primary,
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
            <label style={labelStyle}>{t.name}</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t.namePlaceholder}
              style={inputStyle}
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label style={labelStyle}>{t.phone}</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder={t.phonePlaceholder}
              style={inputStyle}
              required
            />
          </div>

          {/* Email (optional, for notifications) */}
          <div>
            <label style={{ ...labelStyle, opacity: 0.35 }}>EMAIL (para confirmación)</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="tucorreo@ejemplo.com"
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>{t.notes}</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={t.notesPlaceholder}
              rows={3}
              style={{ ...inputStyle, resize: 'none', height: 80 }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '13px', color: '#ef4444', textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || slots.length === 0 || (spacesMode && !activeSpaceId)}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: br,
              border: 'none',
              backgroundColor: primary,
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: `0 8px 24px ${primary}44`,
            }}
          >
            {loading ? t.processing : minPayment > 0 ? t.submitPay(toPesos(minPayment).toLocaleString('es-AR')) : t.submit}
          </button>
        </div>
      </form>
    </div>
  )
}
