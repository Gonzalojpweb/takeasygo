import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import InviteCard from '@/components/invite/InviteCard'
import TenantLogos from '@/components/invite/TenantLogos'

export const metadata = {
  title: 'TGO — Invitación',
  description: 'Descubrí restaurantes takeaway cerca de vos.',
  robots: { index: false, follow: false },
}

export default async function InvitePage() {
  await connectDB()

  const tenants = await Tenant.find({
    'branding.logoUrl': { $ne: '', $exists: true },
  })
    .select('name branding.logoUrl')
    .limit(8)
    .sort({ createdAt: -1 })
    .lean()

  const logoList = tenants
    .map((t: any) => ({
      name: t.name,
      logoUrl: t.branding?.logoUrl,
    }))
    .filter((t) => t.logoUrl)

  return (
    <div className="consumer-dark min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm mx-auto space-y-8">
        <InviteCard />
        {logoList.length > 0 && <TenantLogos tenants={logoList} />}
      </div>
    </div>
  )
}
