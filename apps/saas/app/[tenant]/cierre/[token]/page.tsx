import type { Metadata } from 'next'
import type mongoose from 'mongoose'
import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import CashRegister from '@/models/CashRegister'
import { ZReportSheet } from '@/components/cash/ZReportSheet'
import { PrintButton } from '@/components/cash/PrintButton'
import { isShareTokenValid } from '@/lib/cash/z-share'
import type { ZReport } from '@takeasygo/types'

// ============================================================================
// /[tenant]/cierre/[token] — reporte Z compartible (solo lectura)
// ============================================================================
// Fase 2 de caja (2026-10). Para mandar el cierre por WhatsApp al contador o
// a un socio sin darle acceso al panel. Reglas (Consenso v1 §4):
//   · El token es el `shareToken` del cierre (UUID v4, 128 bits).
//   · Vence a los 30 días del cierre (lib/cash/z-share.ts).
//   · Acotado al tenant de la URL: un token de otro comercio es 404.
//   · Solo el snapshot del Z: sin movimientos individuales ni datos de
//     clientes. noindex.
// ============================================================================

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cierre de caja',
  robots: { index: false, follow: false },
}

const TOKEN_RE = /^[0-9a-f-]{36}$/i

export default async function SharedZPage({ params }: { params: Promise<{ tenant: string; token: string }> }) {
  const { tenant: slug, token } = await params
  if (!TOKEN_RE.test(token)) notFound()

  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id name branding.logoUrl').lean<{
    _id: mongoose.Types.ObjectId
    name: string
    branding?: { logoUrl?: string }
  }>()
  if (!tenant) notFound()

  const register = await CashRegister.findOne({ tenantId: tenant._id, shareToken: token, status: 'closed' })
    .select('locationId openedBy openedAt closedAt zReport')
    .lean()
  if (!register?.zReport || !isShareTokenValid(register.closedAt)) notFound()

  const location = await Location.findOne({ _id: register.locationId, tenantId: tenant._id })
    .select('name timezone')
    .lean<{ name: string; timezone?: string }>()

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end print:hidden">
        <PrintButton />
      </div>
      <ZReportSheet
        z={register.zReport as unknown as ZReport}
        header={{
          tenantName: tenant.name,
          locationName: location?.name ?? 'Sede',
          logoUrl: tenant.branding?.logoUrl || null,
          openedAt: register.openedAt,
          openedBy: register.openedBy,
          timezone: location?.timezone,
        }}
      />
    </main>
  )
}
