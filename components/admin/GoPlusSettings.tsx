'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn, fmt } from '@/lib/utils'
import { canAccess } from '@/lib/plans'
import { Loader2, Calculator, Percent, Save, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import SosCalculator from '@/components/admin/SosCalculator'
import { FieldHint, SectionTip, BannerContext } from '@/components/ui/inline-guide'
import type { Plan } from '@/lib/plans'

interface Props {
  tenantSlug: string
  plan: Plan
  initial: {
    pointsConfig?: {
      enabled: boolean
      mode: 'fixed_per_currency' | 'percentage' | 'hybrid'
      pointsPerCurrency: number
      pointsPercentage: number
      pointsPerOrder: number
      minOrderForPoints: number
      pointsRedemptionValue: number
      redemptionEnabled: boolean
      welcomePoints?: number
    }
    sosLimit?: number
    sosMaxLimit?: number
  }
}

export default function GoPlusSettings({ tenantSlug, plan, initial }: Props) {
  const [pointsEnabled, setPointsEnabled] = useState(initial?.pointsConfig?.enabled ?? false)
  const [pointsMode, setPointsMode] = useState<'fixed_per_currency' | 'percentage' | 'hybrid'>(initial?.pointsConfig?.mode ?? 'fixed_per_currency')
  const [pointsPerCurrency, setPointsPerCurrency] = useState(initial?.pointsConfig?.pointsPerCurrency ?? 0.1)
  const [pointsPercentage, setPointsPercentage] = useState(initial?.pointsConfig?.pointsPercentage ?? 10)
  const [pointsPerOrder, setPointsPerOrder] = useState(initial?.pointsConfig?.pointsPerOrder ?? 0)
  const [minOrderForPoints, setMinOrderForPoints] = useState(initial?.pointsConfig?.minOrderForPoints ?? 0)
  const [pointsRedemptionValue, setPointsRedemptionValue] = useState(initial?.pointsConfig?.pointsRedemptionValue ?? 10)
  const [redemptionEnabled, setRedemptionEnabled] = useState(initial?.pointsConfig?.redemptionEnabled ?? true)
  const [welcomePoints, setWelcomePoints] = useState(initial?.pointsConfig?.welcomePoints ?? 0)

  const [sosLimit, setSosLimit] = useState(initial?.sosLimit ?? 0)
  const [saving, setSaving] = useState(false)

  const sosMaxLimit = initial?.sosMaxLimit ?? 0
  const sosAccessible = canAccess(plan, 'sos')
  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50"

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sosLimit,
          pointsConfig: {
            enabled: pointsEnabled,
            mode: pointsMode,
            pointsPerCurrency,
            pointsPercentage,
            pointsPerOrder,
            minOrderForPoints,
            pointsRedemptionValue,
            redemptionEnabled,
            welcomePoints
          }
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error al guardar')
      toast.success('Configuración guardada')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <BannerContext module="go-plus" />

      {/* ── SISTEMA DE PUNTOS ── */}
      <Card className="border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Calculator size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Sistema de Puntos</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Configurá cómo se acumulan puntos automáticamente</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-8">

          <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40">
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
                pointsEnabled ? 'bg-orange-500/10 text-orange-500' : 'bg-muted text-muted-foreground'
              )}>
                <Percent size={24} />
              </div>
              <div>
                <Label className="text-base font-bold cursor-pointer" htmlFor="points-enabled">
                  {pointsEnabled ? 'Puntos activos' : 'Puntos desactivados'}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pointsEnabled
                    ? 'Los puntos se suman automáticamente después de cada pago.'
                    : 'Activalo para que los clientes acumulen puntos en sus compras.'}
                </p>
              </div>
            </div>
            <Switch
              id="points-enabled"
              checked={pointsEnabled}
              onCheckedChange={setPointsEnabled}
              className="data-[state=checked]:bg-orange-500"
            />
          </div>

          <div className={cn('space-y-6 transition-opacity', pointsEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className={labelCls}>Modo de cálculo</Label>
                <FieldHint description="Fijo: mismos puntos por cada pedido. Porcentaje: escala con el ticket (recomendado). Híbrido: combina ambos para un piso más bonus." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'fixed_per_currency' as const, label: 'Fijo por monto', desc: '1 punto cada $10' },
                  { key: 'percentage' as const, label: 'Porcentaje', desc: '10% del monto' },
                  { key: 'hybrid' as const, label: 'Híbrido', desc: 'Ambos métodos' },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPointsMode(opt.key)}
                    className={cn(
                      'p-4 rounded-xl border-2 text-left transition-all',
                      pointsMode === opt.key
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-border/60 bg-muted/20 hover:border-border/80'
                    )}
                  >
                    <p className="font-bold text-sm mb-1">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(pointsMode === 'fixed_per_currency' || pointsMode === 'hybrid') && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className={labelCls}>Puntos por cada $1</Label>
                    <FieldHint description="Puntos por cada unidad monetaria. Ej: si ponés 10, cada $1 = 10 puntos. En una compra de $10,000 son 100,000 puntos." />
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number" step="0.01" min="0" max="1"
                      value={pointsPerCurrency}
                      onChange={e => setPointsPerCurrency(parseFloat(e.target.value) || 0)}
                      className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                    />
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">Ej: 0.1 = 1 punto cada $10</div>
                  </div>
                </div>
              )}
              {(pointsMode === 'percentage' || pointsMode === 'hybrid') && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className={labelCls}>Porcentaje del monto</Label>
                    <FieldHint description="Porcentaje del ticket que se convierte en puntos. Ej: 5.75% → en una compra de $10,000 suma 575 puntos." />
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number" step="0.5" min="0" max="100"
                      value={pointsPercentage}
                      onChange={e => setPointsPercentage(parseFloat(e.target.value) || 0)}
                      className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                    />
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">% del monto</div>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 leading-tight">
                    Ej: <span className="font-mono font-bold text-amber-600">5.75</span> = 5,75% del monto. No usar decimal (0.0575).
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className={labelCls}>Puntos fijos por pedido</Label>
                  <FieldHint description="Puntos base por cada pedido SIN importar el monto. Funciona como piso mínimo de acumulación." />
                </div>
                <Input
                  type="number" min="0"
                  value={pointsPerOrder}
                  onChange={e => setPointsPerOrder(parseInt(e.target.value) || 0)}
                  className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className={labelCls}>Monto mínimo</Label>
                  <FieldHint description="Pedidos menores a este monto NO generan puntos. Útil para evitar que pedidos muy chicos acumulen sin sentido." />
                </div>
                <Input
                  type="number" min="0" step="0.01"
                  value={minOrderForPoints}
                  onChange={e => setMinOrderForPoints(parseFloat(e.target.value) || 0)}
                  className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className={labelCls}>Valor de canje (ARS)</Label>
                  <FieldHint description="Valor en pesos de cada punto cuando el cliente lo canjea. Si ponés $1, cada 100 puntos = $100 de descuento." />
                </div>
                <Input
                  type="number" min="0" step="1"
                  value={pointsRedemptionValue}
                  onChange={e => setPointsRedemptionValue(parseInt(e.target.value) || 0)}
                  className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40">
              <div className="flex items-center gap-4">
                <div className={cn(
                  'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
                  redemptionEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                )}>
                  <Percent size={24} />
                </div>
                <div>
                  <Label className="text-base font-bold cursor-pointer" htmlFor="redemption-enabled">
                    {redemptionEnabled ? 'Canje activo' : 'Canje desactivado'}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {redemptionEnabled
                      ? 'Los clientes pueden usar puntos en el checkout.'
                      : 'Desactivá para pausar el uso de puntos temporalmente.'}
                  </p>
                </div>
              </div>
              <Switch
                id="redemption-enabled"
                checked={redemptionEnabled}
                onCheckedChange={setRedemptionEnabled}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className={labelCls}>Puntos de bienvenida</Label>
                <FieldHint description="Puntos que recibe el cliente al registrarse al club. Es un incentivo inicial para que empiece a usar el sistema." />
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={welcomePoints}
                  onChange={e => setWelcomePoints(parseInt(e.target.value) || 0)}
                  className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                />
                <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                  Al registrarse
                </div>
              </div>
            </div>
          </div>

          {/* Preview de cálculo */}
          {pointsEnabled && (
            <>
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40">
                <Label className={`${labelCls} mb-3`}>Ejemplo de cálculo</Label>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Monto del pedido:</span>
                    <span className="font-bold">$1,000</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Puntos ganados:</span>
                    <span className="font-bold text-orange-500">
                      {(() => {
                        let pts = 0
                        if (pointsMode === 'fixed_per_currency' || pointsMode === 'hybrid') pts += Math.floor(1000 * pointsPerCurrency)
                        if (pointsMode === 'percentage' || pointsMode === 'hybrid') pts += Math.floor(1000 * pointsPercentage / 100)
                        pts += pointsPerOrder
                        return `${fmt(pts)} puntos`
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              <SectionTip type="metric">
                {pointsMode === 'percentage' ? (
                  <>El 5.75% está calibrado para que el premio equivalga al ~25% del ticket. Si lo subís, los clientes llegan más rápido al premio pero tu margen baja.</>
                ) : pointsMode === 'fixed_per_currency' ? (
                  <>Modo Fijo: asegurate de que los puntos cubran al menos el 5% del ticket promedio. Si tu ticket promedio es $10,000, poné al menos 500 puntos por pedido.</>
                ) : (
                  <>Híbrido es ideal cuando tenés tickets variables (pedidos chicos + grandes). El punto fijo garantiza que todos acumulen, y el % recompensa compras grandes.</>
                )}
              </SectionTip>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── REWARD ADVANCE / SOS ── */}
      <Card className="border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
              <AlertTriangle size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Reward Advance (SOS)</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Préstamo de puntos para que ningún cliente se quede sin su premio</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          {sosAccessible ? (
            <>
              <SectionTip type="warn">
                Reward Advance permite que el cliente canjee aunque le falten puntos. Queda en negativo y los paga con puntos de futuras compras. Si el límite SOS es muy alto, el cliente puede acumular deuda que nunca paga si no vuelve.
              </SectionTip>

              <div className="p-6 rounded-2xl bg-muted/30 border border-border/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Label className={labelCls}>Límite de adelanto</Label>
                      <FieldHint description="Límite máximo de puntos que le podés adelantar al cliente. Recomendado: 20% del valor del premio en puntos." />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {sosLimit === 0
                        ? 'Desactivado — el cliente debe tener los puntos exactos'
                        : `Préstamo de hasta ${fmt(sosLimit)} puntos`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black tabular-nums">{fmt(sosLimit)}</span>
                    <p className="text-[10px] text-muted-foreground">pts máx</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -top-4 left-0 right-0 flex justify-between px-0 pointer-events-none z-10">
                    {[0, 25, 50, 75, 100].map(pct => {
                      const val = Math.round((sosMaxLimit * pct) / 100)
                      return (
                        <div key={pct} className="flex flex-col items-center">
                          <div className="w-px h-3 bg-border/40" />
                          <span className="text-[9px] text-muted-foreground/50 mt-1">{fmt(val)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={sosMaxLimit}
                    step={10}
                    value={sosLimit}
                    onChange={e => setSosLimit(parseInt(e.target.value) || 0)}
                    className="w-full h-2 bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400 rounded-lg appearance-none cursor-pointer accent-red-500 mt-4"
                  />
                </div>

                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0 (desactivado)</span>
                  <span>Límite superadmin: {fmt(sosMaxLimit)}</span>
                </div>

                {sosLimit > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-700 font-medium">
                      Si al cliente le faltan hasta {fmt(sosLimit)} puntos para un premio, el sistema le presta los puntos y su saldo queda en negativo. Deberá volver a comprar para liberar la deuda.
                    </p>
                  </div>
                )}
              </div>

              <SosCalculator
                sosLimit={sosLimit}
                sosMaxLimit={sosMaxLimit}
                onApply={val => setSosLimit(val)}
              />
            </>
          ) : (
            <div className="p-6 rounded-2xl bg-muted/30 border border-border/40 opacity-60">
              <p className="text-sm text-muted-foreground font-medium">
                Reward Advance está disponible en planes Crecimiento y Premium. Actualizá tu plan para acceder.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botón guardar global */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin h-5 w-5" /> : <><Save size={18} className="mr-2" /> Guardar configuración</>}
        </Button>
      </div>
    </div>
  )
}
