'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

interface SlaRule {
  fromStatus: string
  toStatus: string
  slaMinutes: number
  level1Minutes: number
  level2Minutes: number
  level3Minutes: number
  orderMode: string
}

interface ComplianceConfig {
  _id?: string
  tenantId: string
  locationId: string | null
  slaRules: SlaRule[]
  enabled: boolean
  pilotMode: boolean
}

interface Props {
  tenantSlug: string
  locationId: string
  locationName: string
}

const TRANSITION_LABELS: Record<string, string> = {
  'pending→confirmed': 'Recibido → Confirmado',
  'confirmed→preparing': 'Confirmado → Preparando',
  'preparing→ready': 'Preparando → Listo',
  'ready→en_ruta': 'Listo → En ruta',
  'ready→delivered': 'Listo → Entregado',
}

const DEFAULT_RULES: SlaRule[] = [
  { fromStatus: 'pending', toStatus: 'confirmed', slaMinutes: 5, level1Minutes: 3, level2Minutes: 5, level3Minutes: 10, orderMode: 'all' },
  { fromStatus: 'confirmed', toStatus: 'preparing', slaMinutes: 10, level1Minutes: 7, level2Minutes: 12, level3Minutes: 20, orderMode: 'all' },
  { fromStatus: 'preparing', toStatus: 'ready', slaMinutes: 60, level1Minutes: 45, level2Minutes: 60, level3Minutes: 90, orderMode: 'all' },
  { fromStatus: 'ready', toStatus: 'en_ruta', slaMinutes: 1440, level1Minutes: 120, level2Minutes: 360, level3Minutes: 1440, orderMode: 'delivery' },
  { fromStatus: 'ready', toStatus: 'delivered', slaMinutes: 1440, level1Minutes: 120, level2Minutes: 360, level3Minutes: 1440, orderMode: 'takeaway' },
]

export default function ComplianceSettingsPanel({ tenantSlug, locationId, locationName }: Props) {
  const [config, setConfig] = useState<ComplianceConfig>({
    tenantId: '',
    locationId,
    slaRules: DEFAULT_RULES,
    enabled: true,
    pilotMode: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/compliance/config?locationId=${locationId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.config) {
          setConfig(data.config)
        }
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, locationId])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/compliance/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, locationId }),
      })
      if (res.ok) {
        toast.success('Configuración de compliance guardada')
      } else {
        toast.error('Error al guardar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  function updateRule(index: number, field: keyof SlaRule, value: number) {
    const updated = [...config.slaRules]
    updated[index] = { ...updated[index], [field]: value }
    setConfig({ ...config, slaRules: updated })
  }

  function resetToDefaults() {
    setConfig({ ...config, slaRules: DEFAULT_RULES })
    toast.info('Valores restored a defaults')
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Compliance Engine</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Configurá los tiempos límite para {locationName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
              />
              <Label className="text-sm">Activo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.pilotMode}
                onCheckedChange={(checked) => setConfig({ ...config, pilotMode: checked })}
              />
              <Label className="text-sm">Modo piloto</Label>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.pilotMode && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-700">
            <strong>Modo piloto activo:</strong> Solo se muestran alertas L1 y L2. El bloqueo L3 está deshabilitado.
          </div>
        )}

        <div className="space-y-3">
          {config.slaRules.map((rule, index) => {
            const key = `${rule.fromStatus}→${rule.toStatus}`
            const label = TRANSITION_LABELS[key]
            if (!label) return null

            return (
              <div
                key={`${key}-${rule.orderMode}`}
                className="border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{label}</span>
                    {rule.orderMode !== 'all' && (
                      <Badge variant="outline" className="text-xs">
                        {rule.orderMode}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">L1 Aviso (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={rule.level1Minutes}
                      onChange={(e) => updateRule(index, 'level1Minutes', parseInt(e.target.value) || 1)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">L2 Alerta (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={rule.level2Minutes}
                      onChange={(e) => updateRule(index, 'level2Minutes', parseInt(e.target.value) || 1)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">L3 Bloqueo (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={rule.level3Minutes}
                      onChange={(e) => updateRule(index, 'level3Minutes', parseInt(e.target.value) || 1)}
                      className="mt-1"
                      disabled={config.pilotMode}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={resetToDefaults}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Restaurar defaults
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
