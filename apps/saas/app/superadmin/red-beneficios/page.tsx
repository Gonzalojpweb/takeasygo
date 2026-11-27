import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import QrPromo from '@/models/QrPromo'
import { networkOverview } from '@/lib/network/admin'
import NetworkAdmin from '@/components/superadmin/NetworkAdmin'

// Red de beneficios (multi-rubro, etapa 3): comercios adheridos, relaciones
// emisor → receptor, acuerdos comerciales versionados y campañas. Solo
// SuperAdmin (el layout de /superadmin ya exige sesión con MFA).
export default async function RedBeneficiosPage() {
  await connectDB()
  const [overview, tenants] = await Promise.all([
    networkOverview(),
    Tenant.find({ status: { $in: ['active', 'paused'] } }).select('name slug vertical').sort({ name: 1 }).lean<Array<{ _id: unknown; name: string; slug: string; vertical?: string }>>(),
  ])
  // Promos de los comercios de la red (el piloto reusa un QrPromo del receptor).
  const memberTenantIds = (overview.members as Array<{ tenantId: unknown }>).map(m => m.tenantId)
  const promos = memberTenantIds.length
    ? await QrPromo.find({ tenantId: { $in: memberTenantIds }, scope: 'tenant' }).select('tenantId slug title discountPercentage isEnabled').lean<Array<{ _id: unknown; tenantId: unknown; slug: string; title: string; discountPercentage: number; isEnabled: boolean }>>()
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Red de beneficios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Incorporá comercios, autorizá quién distribuye beneficios de quién, cargá el acuerdo de cada receptor y sus campañas.
          La comisión la paga el receptor solo por canje válido. Suspender la recepción no afecta el POS ni las ventas del comercio.
        </p>
      </div>
      <NetworkAdmin
        initial={JSON.parse(JSON.stringify(overview))}
        allTenants={tenants.map(t => ({ id: String(t._id), name: t.name, slug: t.slug, vertical: t.vertical ?? 'gastronomia' }))}
        promos={promos.map(p => ({ id: String(p._id), tenantId: String(p.tenantId), slug: p.slug, title: p.title, discountPercentage: p.discountPercentage, isEnabled: p.isEnabled }))}
      />
    </div>
  )
}
