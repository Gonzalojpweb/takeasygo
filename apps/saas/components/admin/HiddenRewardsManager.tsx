'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Gift, Eye, EyeOff, Clock, CheckCircle2, XCircle,
  Loader2, RefreshCw, Percent, Hash,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePathname } from 'next/navigation'

interface Stats {
  totalClaims: number
  pendingClaims: number
  reservedClaims: number
  consumedClaims: number
  expiredClaims: number
  totalDiscountsApplied: number
}

interface PlanInfo {
  name: string
  hasHiddenRewards: boolean
  maxItems: number
  currentEnabled: number
  isAtLimit: boolean
}

interface RewardItem {
  _id: string
  name: string
  locationId: string
  categoryName: string
  hiddenReward: {
    enabled: boolean
    discountPercentage: number
    title: string
    description: string
    maxClaims: number
    remainingClaims: number
    scheduledStart: string | null
    scheduledEnd: string | null
    claimExpiryDays: number
  }
}

export default function HiddenRewardsManager() {
  const pathname = usePathname()
  const tenantSlug = pathname.split('/')[1]
  const base = `/${tenantSlug}/admin`

  const [stats, setStats] = useState<Stats | null>(null)
  const [items, setItems] = useState<RewardItem[]>([])
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/${tenantSlug}/admin/hidden-rewards`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStats(data.stats)
      setItems(data.itemsWithRewards)
      setPlan(data.plan)
    } catch {
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleReward(item: RewardItem) {
    const newEnabled = !item.hiddenReward.enabled
    const hr = { ...item.hiddenReward, enabled: newEnabled }

    setSaving(item._id)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/hidden-rewards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: item._id,
          locationId: item.locationId,
          hiddenReward: hr,
        }),
      })
      if (!res.ok) throw new Error()
      setItems(prev => prev.map(i =>
        i._id === item._id ? { ...i, hiddenReward: hr } : i
      ))
      toast.success(newEnabled ? 'Recompensa activada' : 'Recompensa desactivada')
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setSaving(null)
    }
  }

  async function updateField(item: RewardItem, field: string, value: any) {
    const hr = { ...item.hiddenReward, [field]: value }
    setSaving(item._id)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/hidden-rewards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: item._id,
          locationId: item.locationId,
          hiddenReward: hr,
        }),
      })
      if (!res.ok) throw new Error()
      setItems(prev => prev.map(i =>
        i._id === item._id ? { ...i, hiddenReward: hr } : i
      ))
      toast.success('Guardado')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recompensas Escondidas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configura recompensas secretas que se revelan al agregar un ítem al carrito
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
        </Button>
      </div>

      {/* Plan limit banner */}
      {plan && !plan.hasHiddenRewards && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          Tu plan <strong>{plan.name}</strong> no incluye recompensas escondidas.
          Actualizá a un plan compatible para activar esta función.
        </div>
      )}
      {plan && plan.hasHiddenRewards && plan.isAtLimit && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-800">
          Límite alcanzado: <strong>{plan.currentEnabled}/{plan.maxItems}</strong> recompensas activas.
          Desactivá una antes de crear otra.
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatCard title="Total Claims" value={stats.totalClaims} icon={Hash} />
          <StatCard title="Pendientes" value={stats.pendingClaims} icon={Clock} color="text-yellow-500" />
          <StatCard title="Reservados" value={stats.reservedClaims} icon={Clock} color="text-blue-500" />
          <StatCard title="Consumidos" value={stats.consumedClaims} icon={CheckCircle2} color="text-green-500" />
          <StatCard title="Expirados" value={stats.expiredClaims} icon={XCircle} color="text-red-500" />
          <StatCard title="Descuentos Aplicados" value={stats.totalDiscountsApplied} icon={Percent} color="text-blue-500" />
        </div>
      )}

      {/* Items list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ítems con Recompensas</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay ítems con recompensas escondidas configuradas.
              <br />
              Activa una recompensa desde el editor del menú.
            </p>
          ) : (
            <div className="space-y-4">
              {items.map(item => (
                <div key={item._id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {item.categoryName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={item.hiddenReward.enabled ? 'default' : 'secondary'}>
                        {item.hiddenReward.enabled ? 'Activa' : 'Inactiva'}
                      </Badge>
                      <Switch
                        checked={item.hiddenReward.enabled}
                        onCheckedChange={() => toggleReward(item)}
                        disabled={saving === item._id}
                      />
                    </div>
                  </div>

                  {item.hiddenReward.enabled && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Título</label>
                        <Input
                          value={item.hiddenReward.title}
                          onChange={e => {
                            const hr = { ...item.hiddenReward, title: e.target.value }
                            setItems(prev => prev.map(i => i._id === item._id ? { ...i, hiddenReward: hr } : i))
                          }}
                          onBlur={() => updateField(item, 'title', item.hiddenReward.title)}
                          placeholder="Ej: 2x1 en bebidas"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Descuento %</label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={item.hiddenReward.discountPercentage}
                          onChange={e => {
                            const hr = { ...item.hiddenReward, discountPercentage: Number(e.target.value) }
                            setItems(prev => prev.map(i => i._id === item._id ? { ...i, hiddenReward: hr } : i))
                          }}
                          onBlur={() => updateField(item, 'discountPercentage', item.hiddenReward.discountPercentage)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Máx. Claims (0=infinito)</label>
                        <Input
                          type="number"
                          min={0}
                          value={item.hiddenReward.maxClaims}
                          onChange={e => {
                            const hr = { ...item.hiddenReward, maxClaims: Number(e.target.value), remainingClaims: Number(e.target.value) }
                            setItems(prev => prev.map(i => i._id === item._id ? { ...i, hiddenReward: hr } : i))
                          }}
                          onBlur={() => updateField(item, 'maxClaims', item.hiddenReward.maxClaims)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Días de validez</label>
                        <Input
                          type="number"
                          min={1}
                          value={item.hiddenReward.claimExpiryDays}
                          onChange={e => {
                            const hr = { ...item.hiddenReward, claimExpiryDays: Number(e.target.value) }
                            setItems(prev => prev.map(i => i._id === item._id ? { ...i, hiddenReward: hr } : i))
                          }}
                          onBlur={() => updateField(item, 'claimExpiryDays', item.hiddenReward.claimExpiryDays)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, color }: {
  title: string; value: number; icon: any; color?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${color || 'text-muted-foreground'}`} />
          <span className="text-xs text-muted-foreground">{title}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
