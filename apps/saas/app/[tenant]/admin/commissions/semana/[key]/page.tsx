import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canPayCommissions, canViewCommissions } from '@/lib/commission-access'
import CommissionWeekDetail from '@/components/admin/commissions/CommissionWeekDetail'

// Tickets de la semana (admin, manager y cajero). La API valida todo de nuevo.
export default async function CommissionWeekPage({ params }: { params: Promise<{ tenant: string; key: string }> }) {
  const session = await auth()
  const role = session?.user?.role
  const { tenant: tenantSlug, key } = await params
  if (!canViewCommissions(role)) redirect(`/${tenantSlug}/admin`)
  return <CommissionWeekDetail tenantSlug={tenantSlug} weekKey={key} canPay={canPayCommissions(role)} />
}
