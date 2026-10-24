import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import mongoose from 'mongoose'
import { ArrowLeft } from 'lucide-react'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import CashRegister from '@/models/CashRegister'
import { getPageScope } from '@/lib/page-scope'
import { ZReportSheet } from '@/components/cash/ZReportSheet'
import { ZShareActions } from '@/components/cash/ZShareActions'
import { isShareTokenValid, zSharePath } from '@/lib/cash/z-share'
import type { ZReport } from '@takeasygo/types'

// ============================================================================
// Cajas POS → un cierre: reporte Z completo, impresión y link compartible
// ============================================================================
// Fase 2 de caja (2026-10) — ADMIN/FASE2_Z_PARA_LLEVARSE.md
// Lee solo el snapshot inmutable. Respeta el alcance de sede del usuario.
// ============================================================================

export default async function CajaPosDetailPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) notFound()
  const tenantSlug = (await headers()).get('x-tenant-slug')

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name branding.logoUrl features.posEnabled')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; branding?: { logoUrl?: string }; features?: { posEnabled?: boolean } }>()
  if (!tenant || !tenant.features?.posEnabled) notFound()

  const scope = await getPageScope()
  const register = await CashRegister.findOne({ _id: id, tenantId: tenant._id, status: 'closed', ...scope.locationFilter })
    .select('locationId openedBy openedAt closedAt zReport shareToken')
    .lean()
  if (!register?.zReport) notFound()

  const location = await Location.findOne({ _id: register.locationId, tenantId: tenant._id })
    .select('name timezone')
    .lean<{ name: string; timezone?: string }>()

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/${tenantSlug}/admin/caja-pos`}
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} aria-hidden /> Cajas POS
        </Link>
        <ZShareActions
          tenantSlug={tenantSlug ?? ''}
          registerId={id}
          sharePath={register.shareToken && tenantSlug ? zSharePath(tenantSlug, register.shareToken) : null}
          shareExpired={!isShareTokenValid(register.closedAt)}
        />
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
    </div>
  )
}
