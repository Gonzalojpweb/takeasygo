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
//   modality: 'electronic' (ARCA) | 'controller' (impresora fiscal) | 'none'.
//     02/11: una sede con impresora fiscal homologada activa factura con el
//     equipo y NO necesita certificado de ARCA ni la facturación activada.
// ============================================================================

interface ProfileLean {
  enabled: boolean
  ivaCondition: IssuerIvaCondition | null
  invoicingMode: 'ask' | 'always' | 'off'
  environment: 'homologation' | 'production'
  pointsOfSale: { locationId: unknown; number: number }[]
  controllers?: { locationId: unknown; active: boolean }[]
}

export const GET = posRoute('orders.pay', async (ctx) => {
  const p = await FiscalProfile.findOne({ tenantId: ctx.tenantId })
    .select('enabled ivaCondition invoicingMode environment pointsOfSale controllers')
    .lean<ProfileLean>()
  const hasPos = Boolean(p?.pointsOfSale?.some((x) => String(x.locationId) === ctx.locationId))
  const controller = Boolean(p?.controllers?.some((c) => c.active && String(c.locationId) === ctx.locationId))
  const electronic = Boolean(p?.enabled && p.ivaCondition && hasPos)
  const enabled = Boolean(p && p.invoicingMode !== 'off' && (controller || electronic))
  return NextResponse.json({
    enabled,
    modality: controller ? 'controller' : electronic ? 'electronic' : 'none',
    mode: enabled ? p!.invoicingMode : 'off',
    environment: p?.environment ?? 'homologation',
    letterForFinalConsumer: p?.ivaCondition ? invoiceLetterFor(p.ivaCondition, 'consumidor_final') : null,
    letterForCompany: p?.ivaCondition ? invoiceLetterFor(p.ivaCondition, 'responsable_inscripto') : null,
  })
})
