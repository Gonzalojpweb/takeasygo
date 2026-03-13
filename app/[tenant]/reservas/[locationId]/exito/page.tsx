import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Reservation from '@/models/Reservation'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
  searchParams: Promise<{ reservaId?: string; pending?: string }>
}

export default async function ReservaExitoPage({ params, searchParams }: Props) {
  const { tenant: tenantSlug } = await params
  const { reservaId, pending } = await searchParams

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  let reservation: any = null
  if (reservaId) {
    reservation = await Reservation.findOne({ _id: reservaId, tenantId: tenant._id }).lean()
  }

  const branding = tenant.branding
  const isPending = pending === '1'

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: branding.backgroundColor,
      color: branding.textColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'inherit',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '380px', width: '100%' }}>
        <div style={{
          width: 80, height: 80,
          borderRadius: '50%',
          backgroundColor: isPending ? '#f59e0b20' : branding.primaryColor + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          {isPending ? (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={branding.primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        <h2 style={{ fontSize: '26px', fontWeight: 900, marginBottom: '10px' }}>
          {isPending ? 'Pago en proceso' : '¡Reserva confirmada!'}
        </h2>

        {reservation && (
          <div style={{
            backgroundColor: branding.primaryColor + '10',
            border: `1.5px solid ${branding.primaryColor}25`,
            borderRadius: '16px',
            padding: '20px',
            margin: '20px 0',
            textAlign: 'left',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, marginBottom: 12 }}>Detalle de tu reserva</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'N° Reserva', value: reservation.reservationNumber },
                { label: 'Fecha', value: reservation.date },
                { label: 'Horario', value: reservation.time },
                { label: 'Personas', value: reservation.partySize },
                { label: 'A nombre de', value: reservation.name },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', opacity: 0.55 }}>{label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{value}</span>
                </div>
              ))}
              {reservation.notes && (
                <div>
                  <span style={{ fontSize: '12px', opacity: 0.55, display: 'block', marginBottom: 2 }}>Observaciones</span>
                  <span style={{ fontSize: '13px' }}>{reservation.notes}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <p style={{ fontSize: '13px', opacity: 0.6, lineHeight: 1.6 }}>
          {isPending
            ? 'Tu pago está siendo procesado. Te confirmaremos la reserva a la brevedad.'
            : 'Te esperamos. Comunicate si necesitás modificar tu reserva.'}
        </p>

        <a
          href={`/${tenantSlug}/menu`}
          style={{
            display: 'inline-block',
            marginTop: '24px',
            padding: '12px 28px',
            borderRadius: '9999px',
            border: `1.5px solid ${branding.primaryColor}`,
            color: branding.primaryColor,
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Ver menú
        </a>
      </div>
    </div>
  )
}
