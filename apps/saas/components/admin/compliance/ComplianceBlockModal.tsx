'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Clock, CheckCircle, ExternalLink, Loader2, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

// ============================================================================
// Pedidos bloqueados (compliance nivel 3)
// ============================================================================
// Un pedido que superó el tiempo límite de su estado bloquea el panel hasta
// que alguien lo atienda. Bug 25/10 (kekelarry): «Gestionar pedido» llevaba a
// /admin/orders, pero este aviso vive en el layout de TODO el admin y se
// volvía a abrir bloqueado encima de Pedidos → el admin quedaba encerrado.
// Ahora:
//   · Se gestiona desde el aviso: «Marcar como Listo / Entregado…» avanza el
//     pedido con la misma ruta de siempre (PATCH /orders/[id]/status). Al
//     cambiar de estado la alerta se cierra sola y el aviso desaparece.
//   · En la página de Pedidos NO bloquea: queda como panel flotante para
//     poder trabajar en el tablero (cancelar con motivo, ver detalle…).
//   · Si el cambio no se puede (p. ej. lo maneja una integración POS), se
//     explica y se ofrece ir a Pedidos.
//   · Explica por qué aparece y cómo evitarlo.
// ============================================================================

interface ComplianceAlert {
  _id: string
  orderId: string
  orderNumber: string
  level: 1 | 2 | 3
  fromStatus: string
  toStatus: string
  locationId: string
  triggeredAt: string
  clientConfirmed: boolean
}

interface ComplianceStatus {
  hasLevel3: boolean
  hasLevel2: boolean
  blockedLocations: string[]
  warningLocations: string[]
  alerts: ComplianceAlert[]
  total: number
}

interface Props {
  tenantSlug: string
  activeLocationId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Recibido',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  en_ruta: 'En ruta',
  arrived: 'Llegó',
  delivered: 'Entregado',
}

const label = (s: string) => STATUS_LABELS[s] ?? s

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
}

function elapsedText(iso: string): string {
  const m = minutesAgo(iso)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  return h < 24 ? `hace ${h} h ${m % 60} min` : `hace ${Math.floor(h / 24)} d ${h % 24} h`
}

export function ComplianceBlockModal({
  tenantSlug,
  activeLocationId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const onOrdersPage = Boolean(pathname && /\/admin\/orders(\/|$)/.test(pathname))
  const [status, setStatus] = useState<ComplianceStatus | null>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showHelp, setShowHelp] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const open = controlledOpen ?? internalOpen
  const onOpenChange = controlledOnOpenChange ?? setInternalOpen

  const fetchStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (activeLocationId) params.set('locationId', activeLocationId)
      const res = await fetch(`/api/${tenantSlug}/compliance/status?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setStatus(data)

        // Auto-open if there are L3 alerts for the active location
        if (data.hasLevel3) {
          const hasBlockedForLocation = activeLocationId
            ? data.blockedLocations.includes(activeLocationId)
            : data.blockedLocations.length > 0
          if (hasBlockedForLocation) {
            setInternalOpen(true)
          }
        }
      }
    } catch {
      // silent
    }
  }, [tenantSlug, activeLocationId])

  useEffect(() => {
    if (tenantSlug) {
      fetchStatus()
      const interval = setInterval(fetchStatus, 15_000) // Poll every 15s
      return () => clearInterval(interval)
    }
  }, [tenantSlug, fetchStatus])

  // Filter L3 alerts for the active location
  const blockedAlerts = status?.alerts.filter(
    (a) =>
      a.level === 3 &&
      (activeLocationId ? a.locationId === activeLocationId : true)
  ) ?? []

  const isBlocked = blockedAlerts.length > 0

  /** Avanza el pedido al estado que le falta (misma ruta que el tablero). */
  const advance = useCallback(async (alert: ComplianceAlert) => {
    setBusy(alert._id)
    setErrors((e) => ({ ...e, [alert._id]: '' }))
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${alert.orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: alert.toStatus }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = res.status === 409
          ? 'Este pedido lo actualiza la integración POS. Movelo desde el POS o gestionalo en Pedidos.'
          : res.status === 400
            ? `${body.error ?? 'Ese cambio de estado no está permitido.'} Revisá el pedido en Pedidos (puede que ya haya cambiado).`
            : res.status === 404
              ? 'No encontramos el pedido (o es de una sede que no tenés asignada).'
              : body.error ?? 'No se pudo actualizar el pedido.'
        setErrors((e) => ({ ...e, [alert._id]: msg }))
        return
      }
      toast.success(`Pedido #${alert.orderNumber} → ${label(alert.toStatus)}`)
      await fetchStatus()
    } catch {
      setErrors((e) => ({ ...e, [alert._id]: 'Sin conexión. Probá de nuevo.' }))
    } finally {
      setBusy(null)
    }
  }, [tenantSlug, fetchStatus])

  const goToOrders = (alert: ComplianceAlert) => {
    router.push(`/${tenantSlug}/admin/orders?order=${encodeURIComponent(alert.orderId)}`)
  }

  const alertList = (
    <div className="space-y-3">
      {blockedAlerts.map((alert) => (
        <div key={alert._id} className="border border-red-500/20 rounded-xl p-4 bg-red-500/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm">#{alert.orderNumber}</span>
              {alert.clientConfirmed && (
                <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-600">
                  Confirmado por cliente
                </Badge>
              )}
            </div>
            <Badge variant="destructive" className="text-xs">Demorado</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-3">
            <Clock className="h-3 w-3" />
            <span>
              Sigue en <strong className="text-foreground">{label(alert.fromStatus)}</strong> — tenía que pasar a{' '}
              <strong className="text-foreground">{label(alert.toStatus)}</strong>
            </span>
            <span className="text-xs">(alerta {elapsedText(alert.triggeredAt)})</span>
          </div>
          {errors[alert._id] && (
            <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" role="alert">
              {errors[alert._id]}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy !== null} onClick={() => { void advance(alert) }}>
              {busy === alert._id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Marcar como {label(alert.toStatus)}
            </Button>
            {!onOrdersPage && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => goToOrders(alert)}>
                <ExternalLink className="h-3 w-3 mr-1" />
                Ver en Pedidos
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const help = (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
      <button type="button" className="flex w-full items-center justify-between font-semibold text-foreground" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
        <span className="flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5" /> ¿Por qué aparece y cómo evitarlo?</span>
        {showHelp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {showHelp && (
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Cada estado del pedido tiene un tiempo máximo. Si un pedido se queda quieto (por ejemplo, en «Preparando»), primero avisamos y después bloqueamos para que no quede un cliente esperando sin respuesta.</li>
          <li>Mové cada pedido apenas cambia en la cocina: «Listo» cuando está para entregar o retirar, «Entregado» cuando se lo llevaron.</li>
          <li>Si el pedido ya se entregó y se olvidaron de marcarlo, marcalo ahora: no afecta la venta.</li>
          <li>Si el pedido no va a salir, cancelalo desde Pedidos indicando el motivo (el cliente recibe el aviso).</li>
          <li>Si trabajás con el POS, actualizá el estado desde el POS: se sincroniza solo.</li>
        </ul>
      )}
    </div>
  )

  // Sin pedidos demorados (o todavía cargando) no se muestra nada.
  if (!isBlocked) return null

  // ── En Pedidos: panel flotante, sin bloquear el tablero ──────────────────
  if (onOrdersPage) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-red-500/30 bg-background shadow-2xl" role="region" aria-label="Pedidos demorados">
        <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
          <span className="flex items-center gap-2 font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4" /> {blockedAlerts.length} pedido(s) demorado(s)
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!collapsed && (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 pb-4">
            <p className="text-xs text-muted-foreground">Movelos desde acá o desde el tablero. El resto del panel queda bloqueado hasta atenderlos.</p>
            {alertList}
            {help}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={isBlocked ? undefined : onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => {
          if (isBlocked) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isBlocked) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Pedidos bloqueados
          </DialogTitle>
          <DialogDescription>
            Hay {blockedAlerts.length} pedido(s) que superaron el tiempo límite. Actualizalos para seguir usando el panel.
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 space-y-3">
          {alertList}
          {help}
        </div>
      </DialogContent>
    </Dialog>
  )
}
