'use client'

// ── DashboardWidgets ─────────────────────────────────────────────────────────
//
// Widgets de la home admin conectados al selector de sede del TopBar.
// El server prefetchea /summary con el alcance del usuario (sus sedes o el
// consolidado); al elegir una sede se vuelve a pedir con ?locationId= y los
// widgets se actualizan. ICO y comisiones son métricas del negocio completo:
// solo se muestran en la vista consolidada.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAdminLocation } from '@/contexts/AdminLocationContext'
import StatsCards from '@/components/admin/dashboard/StatsCards'
import KPIsMes from '@/components/admin/dashboard/KPIsMes'
import MarginRecoveryCard from '@/components/admin/dashboard/MarginRecoveryCard'
import { ICOWidget } from '@/components/admin/dashboard/ICOWidget'
import MetodosPago from '@/components/admin/dashboard/MetodosPago'
import DeliveryConciliation from '@/components/admin/dashboard/DeliveryConciliation'
import { ComisionesBanner } from '@/components/admin/dashboard/ComisionesBanner'
import { CashAdjustmentBanner } from '@/components/admin/CashAdjustmentBanner'
import MenuActividad from '@/components/admin/dashboard/MenuActividad'
import CalificacionesWidget from '@/components/admin/dashboard/CalificacionesWidget'
import ClubWidget from '@/components/admin/dashboard/ClubWidget'
import PedidosRecientes from '@/components/admin/dashboard/PedidosRecientes'

interface Props {
  tenantSlug: string
  userName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape del /summary, tipado por cada widget
  initialSummary: any
  /** Se renderiza entre las stats y los KPIs (acciones rápidas). */
  children?: ReactNode
}

export default function DashboardWidgets({ tenantSlug, userName, initialSummary, children }: Props) {
  const { activeLocationId } = useAdminLocation()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ídem initialSummary
  const [summary, setSummary] = useState<any>(initialSummary)
  const [loading, setLoading] = useState(false)
  // La primera selección (null = alcance por defecto) ya viene del server.
  const lastFetched = useRef<string | null>(null)

  useEffect(() => {
    if (activeLocationId === lastFetched.current) return
    lastFetched.current = activeLocationId
    let cancelled = false
    setLoading(true)
    const qs = activeLocationId ? `?locationId=${encodeURIComponent(activeLocationId)}` : ''
    fetch(`/api/${tenantSlug}/admin/dashboard/summary${qs}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data) setSummary(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeLocationId, tenantSlug])

  const consolidated = summary?.scope?.consolidated !== false

  return (
    <div className={loading ? 'space-y-6 opacity-60 transition-opacity' : 'space-y-6 transition-opacity'}>
      <StatsCards tenantSlug={tenantSlug} data={summary?.stats} />

      {children}

      <KPIsMes tenantSlug={tenantSlug} data={summary?.kpis} />

      <MarginRecoveryCard tenantSlug={tenantSlug} data={summary?.marginRecovery} />

      {consolidated && <ICOWidget tenantSlug={tenantSlug} userName={userName} data={summary?.ico ?? undefined} />}

      <MetodosPago tenantSlug={tenantSlug} data={summary?.metodosPago} />

      <DeliveryConciliation tenantSlug={tenantSlug} data={summary?.deliveryConciliation} />

      {consolidated && <ComisionesBanner tenantSlug={tenantSlug} data={summary?.comisiones?.pending} />}

      <CashAdjustmentBanner tenantSlug={tenantSlug} />

      <MenuActividad tenantSlug={tenantSlug} data={summary?.menuActividad} />

      <CalificacionesWidget tenantSlug={tenantSlug} data={summary?.calificaciones} />

      <ClubWidget tenantSlug={tenantSlug} data={summary?.club} />

      <PedidosRecientes tenantSlug={tenantSlug} data={summary?.pedidosRecientes} />
    </div>
  )
}
