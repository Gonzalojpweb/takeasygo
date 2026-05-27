import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import SuperadminBusinessCompaniesClient from '@/components/superadmin/SuperadminBusinessCompaniesClient'

export default async function SuperadminBusinessCompaniesPage() {
  await connectDB()

  const [companies, tenants] = await Promise.all([
    CorporateAccount.find().sort({ createdAt: -1 }).lean(),
    Tenant.find({ isActive: true }).select('name slug').sort({ name: 1 }).lean(),
  ])

  const tenantMap = Object.fromEntries(
    tenants.map(t => [t._id.toString(), { name: t.name, slug: t.slug }])
  )

  const serializedCompanies = companies.map(c => ({
    _id: c._id.toString(),
    companyName: c.companyName,
    companyTaxId: c.companyTaxId,
    status: c.status,
    paymentMode: c.paymentMode,
    paymentTerms: c.paymentTerms,
    companyAdminEmail: c.companyAdminEmail,
    employeeEmails: c.employeeEmails ?? [],
    notes: c.notes,
    registeredBy: c.registeredBy,
    tenantId: c.tenantId.toString(),
    tenantName: tenantMap[c.tenantId.toString()]?.name ?? '(sin tenant)',
    tenantSlug: tenantMap[c.tenantId.toString()]?.slug ?? '',
    createdAt: c.createdAt?.toISOString?.() ?? c.createdAt,
  }))

  const serializedTenants = tenants.map(t => ({
    _id: t._id.toString(),
    name: t.name,
    slug: t.slug,
  }))

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">Empresas Business</h1>
        <p className="text-muted-foreground mt-1 font-medium">
          Registrá empresas corporativas y asignalas a tenants de la red TakeasyGo.
        </p>
      </div>

      <SuperadminBusinessCompaniesClient
        companies={serializedCompanies}
        tenants={serializedTenants}
      />
    </div>
  )
}
