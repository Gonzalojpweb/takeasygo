'use client'

import { useEffect, useState, useCallback } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Clock, X } from 'lucide-react'

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
  onAlertsChange?: (status: ComplianceStatus) => void
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

export function ComplianceAlertBanner({ tenantSlug, activeLocationId, onAlertsChange }: Props) {
  const [status, setStatus] = useState<ComplianceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (activeLocationId) params.set('locationId', activeLocationId)
      const res = await fetch(`/api/${tenantSlug}/compliance/status?${params}`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        onAlertsChange?.(data)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, activeLocationId, onAlertsChange])

  useEffect(() => {
    if (tenantSlug) {
      fetchStatus()
      // Poll every 30 seconds for real-time updates
      const interval = setInterval(fetchStatus, 30_000)
      return () => clearInterval(interval)
    }
  }, [tenantSlug, fetchStatus])

  if (loading || !status || status.total === 0 || dismissed) return null

  // Filter alerts for active location if specified
  const relevantAlerts = activeLocationId
    ? status.alerts.filter((a) => a.locationId === activeLocationId)
    : status.alerts

  if (relevantAlerts.length === 0) return null

  const l2Alerts = relevantAlerts.filter((a) => a.level === 2)
  const l3Alerts = relevantAlerts.filter((a) => a.level === 3)

  // Don't show banner if L3 is present (block modal takes over)
  if (l3Alerts.length > 0) return null

  return (
    <Alert variant="destructive" className="mb-4 border-amber-500/50 bg-amber-500/5">
      <AlertTriangle className="h-4 w-4 text-amber-500" />
      <AlertTitle className="flex items-center gap-2">
        Pedidos requieren atención
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-xs">
          {l2Alerts.length} {l2Alerts.length === 1 ? 'pedido' : 'pedidos'}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-2 mt-2">
          {l2Alerts.slice(0, 3).map((alert) => (
            <div
              key={alert._id}
              className="flex items-center justify-between text-sm bg-amber-500/5 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-amber-500" />
                <span className="font-mono text-xs">#{alert.orderNumber}</span>
                <span className="text-muted-foreground">
                  {STATUS_LABELS[alert.fromStatus] ?? alert.fromStatus} →{' '}
                  {STATUS_LABELS[alert.toStatus] ?? alert.toStatus}
                </span>
                {alert.clientConfirmed && (
                  <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-600">
                    Cliente confirmó
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {l2Alerts.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{l2Alerts.length - 3} pedido(s) más
            </p>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = `/${tenantSlug}/admin/orders`}
          >
            Ver pedidos
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3 w-3 mr-1" />
            Descartar
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
