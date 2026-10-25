import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canPayCommissions, canViewCommissions } from '@/lib/commission-access'
import { Coins } from 'lucide-react'
import CommissionsCenter from '@/components/admin/commissions/CommissionsCenter'
import CommissionPayerSettings from '@/components/admin/commissions/CommissionPayerSettings'

// Comisiones por transferencia y efectivo: admin, manager y cajero (pagar: admin y manager).
// Quién paga la comisión (cliente o comercio): lo elige el admin.
export default async function CommissionsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const session = await auth()
  const role = session?.user?.role
  const { tenant: tenantSlug } = await params
  if (!canViewCommissions(role)) redirect(`/${tenantSlug}/admin`)

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <Coins size={22} className="text-primary" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comisiones</h1>
          <p className="text-sm font-medium text-muted-foreground">Qué se le debe a TakeasyGO por pedidos pagados por transferencia o efectivo, por qué y cómo pagarlo.</p>
        </div>
      </div>
      <CommissionPayerSettings tenantSlug={tenantSlug} />
      <Suspense>
        <CommissionsCenter tenantSlug={tenantSlug} canPay={canPayCommissions(role)} />
      </Suspense>
    </div>
  )
}
