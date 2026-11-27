import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
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
      />
    </div>
  )
}
