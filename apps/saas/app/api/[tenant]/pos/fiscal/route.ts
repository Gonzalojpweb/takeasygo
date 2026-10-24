import { NextResponse } from 'next/server'
import FiscalProfile from '@/models/FiscalProfile'
import { posRoute } from '@/lib/pos-online/route'
import { invoiceLetterFor, type IssuerIvaCondition } from '@takeasygo/business'

// ============================================================================
// GET /api/[tenant]/pos/fiscal — cómo factura este POS (Fase 5 de caja)
// ============================================================================
// Lo mínimo para dibujar el selector de factura en el cobro. Sin secretos.
//   enabled: la facturación está activa y esta sede tiene punto de venta.
//   mode: 'ask' | 'always' | 'off'.
//   letterForFinalConsumer / letterForCompany: qué letra sale en cada caso.
// ============================================================================

interface ProfileLean {
  enabled: boolean
  ivaCondition: IssuerIvaCondition | null
  invoicingMode: 'ask' | 'always' | 'off'
  environment: 'homologation' | 'production'
  pointsOfSale: { locationId: unknown; number: number }[]
}

export const GET = posRoute('orders.pay', async (ctx) => {
  const p = await FiscalProfile.findOne({ tenantId: ctx.tenantId })
    .select('enabled ivaCondition invoicingMode environment pointsOfSale')
    .lean<ProfileLean>()
  const hasPos = Boolean(p?.pointsOfSale?.some((x) => String(x.locationId) === ctx.locationId))
  const enabled = Boolean(p?.enabled && p.ivaCondition && hasPos && p.invoicingMode !== 'off')
  return NextResponse.json({
    enabled,
    mode: enabled ? p!.invoicingMode : 'off',
    environment: p?.environment ?? 'homologation',
    letterForFinalConsumer: p?.ivaCondition ? invoiceLetterFor(p.ivaCondition, 'consumidor_final') : null,
    letterForCompany: p?.ivaCondition ? invoiceLetterFor(p.ivaCondition, 'responsable_inscripto') : null,
  })
})
