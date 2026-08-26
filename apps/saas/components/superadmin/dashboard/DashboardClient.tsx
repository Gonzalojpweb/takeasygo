'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import AhoraEnTGO from './AhoraEnTGO'
import PedidosActivos from './PedidosActivos'
import ActividadReciente from './ActividadReciente'
import KPIsHoy from './KPIsHoy'
import TendenciaChart from './TendenciaChart'
import SaludRed from './SaludRed'
import FeedbackPanel from './FeedbackPanel'
import MetodosPago from './MetodosPago'
import CommissionsOverview from './CommissionsOverview'

export interface DashboardData {
  ahora: {
    operandoAhora: number
    conPedidosActivos: number
    requierenAtencion: number
    abiertosSinPedidos: number
    sinActividad: number
    totalTenants: number
  }
  pedidosActivos: Array<{
    tenantId: string
    name: string
    slug: string
    plan: string
    isOpen: boolean
    isOperational: boolean
    activeOrders: Array<{
      orderId: string
      orderNumber: number
      status: string
      createdAt: string
      minutesInStatus: number
      estimatedReadyAt?: string
      isStuck: boolean
      stuckReason?: string
    }>
    statusCounts: Record<string, number>
    needsAttention: boolean
    attentionReasons: string[]
    pedidosHoy: number
    ingresosHoyCents: number
    ultimaActividad?: string
  }>
  actividadReciente: Array<{
    type: string
    tenantName: string
    tenantSlug: string
    message: string
    timestamp: string
  }>
  kpis: {
    tenantsActivos: number
    pedidosHoy: number
    ingresosHoyCents: number
    ticketPromedioCents: number
    usuariosTotales: number
  }
  tendencia7Dias: Array<{
    date: string
    pedidos: number
    ingresosCents: number
  }>
  saludRed: {
    operandoNormalmente: number
    requierenAtencion: number
    sinActividad: number
    tenants: Array<{
      tenantId: string
      name: string
      slug: string
      plan: string
      estado: 'operando' | 'atencion' | 'sin_actividad'
      pedidosActivos: number
      pedidosHoy: number
      ingresosHoyCents: number
      ultimaActividad?: string
    }>
  }
  feedback: {
    negativosHoy: number
    totalHoy: number
    satisfaccionPct: number
    items: Array<{
      tenantName: string
      tenantSlug: string
      type: string
      stars?: number
      satisfaction?: string
      comment: string
      createdAt: string
    }>
  }
  metodosPago: Array<{
    method: string
    count: number
    totalCents: number
  }>
  lastUpdated: string
}

const POLL_INTERVAL = 30_000

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [ahoraRes, pedidosRes, kpisRes, saludRes, feedbackRes, actividadRes, tendenciaRes, metodosPagoRes] = await Promise.all([
        fetch('/api/superadmin/dashboard/ahora'),
        fetch('/api/superadmin/dashboard/pedidos'),
        fetch('/api/superadmin/dashboard/kpis'),
        fetch('/api/superadmin/dashboard/salud'),
        fetch('/api/superadmin/dashboard/feedback'),
        fetch('/api/superadmin/dashboard/actividad'),
        fetch('/api/superadmin/dashboard/tendencia'),
        fetch('/api/superadmin/dashboard/metodos-pago'),
      ])

      const ahora = await ahoraRes.json()
      const pedidos = await pedidosRes.json()
      const kpis = await kpisRes.json()
      const salud = await saludRes.json()
      const feedback = await feedbackRes.json()
      const actividad = await actividadRes.json()
      const tendencia = await tendenciaRes.json()
      const metodosPago = await metodosPagoRes.json()

      if (!ahoraRes.ok) throw new Error(ahora.detail || ahora.error || 'Error al cargar ahora')
      if (!pedidosRes.ok) throw new Error(pedidos.detail || pedidos.error || 'Error al cargar pedidos')
      if (!kpisRes.ok) throw new Error(kpis.detail || kpis.error || 'Error al cargar kpis')
      if (!saludRes.ok) throw new Error(salud.detail || salud.error || 'Error al cargar salud')
      if (!feedbackRes.ok) throw new Error(feedback.detail || feedback.error || 'Error al cargar feedback')
      if (!actividadRes.ok) throw new Error(actividad.detail || actividad.error || 'Error al cargar actividad')
      if (!tendenciaRes.ok) throw new Error(tendencia.detail || tendencia.error || 'Error al cargar tendencia')
      if (!metodosPagoRes.ok) throw new Error(metodosPago.detail || metodosPago.error || 'Error al cargar métodos de pago')

      setData({
        ahora: ahora.ahora,
        pedidosActivos: pedidos.pedidosActivos,
        kpis: kpis.kpis,
        saludRed: salud.saludRed,
        feedback: feedback.feedback,
        actividadReciente: actividad.actividadReciente,
        tendencia7Dias: tendencia.tendencia7Dias,
        metodosPago: metodosPago.metodosPago,
        lastUpdated: new Date().toISOString(),
      })
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Polling with visibility pause
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    function startPolling() {
      interval = setInterval(fetchData, POLL_INTERVAL)
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        clearInterval(interval)
        fetchData()
        startPolling()
      } else {
        clearInterval(interval)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    startPolling()

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchData])

  if (loading && !data) {
    return <DashboardSkeleton />
  }

  if (error && !data) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500 pb-10">
        <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
        <div className="rounded-2xl border border-border p-12 text-center bg-card">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <RefreshCw size={14} />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const lastUpdated = new Date(data.lastUpdated)
  const timeStr = lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            Estado de la red TGO
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {loading && <Loader2 size={12} className="animate-spin text-primary" />}
          <span suppressHydrationWarning>Última sync: {timeStr}</span>
        </div>
      </div>

      {/* Layer 1: AHORA EN TGO */}
      <AhoraEnTGO data={data.ahora} />

      {/* Layer 2: PEDIDOS ACTIVOS */}
      <PedidosActivos items={data.pedidosActivos} />

      {/* Layer 3: ACTIVIDAD RECIENTE */}
      <ActividadReciente items={data.actividadReciente} />

      {/* Layer 4 + 5: KPIs + Tendencia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KPIsHoy data={data.kpis} />
        <TendenciaChart data={data.tendencia7Dias} />
      </div>

      {/* Layer 6: SALUD DE LA RED */}
      <SaludRed data={data.saludRed} />

      {/* Layer 7 + 8: Feedback + Métodos de pago */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FeedbackPanel data={data.feedback} />
        <MetodosPago data={data.metodosPago} />
      </div>

      {/* Layer 9: COMISIONES */}
      <CommissionsOverview />
    </div>
  )
}
