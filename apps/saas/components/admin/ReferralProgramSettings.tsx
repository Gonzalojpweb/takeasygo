'use client'

// ============================================================================
// Programa de referidos «Invitá y ganá» — configuración y resultados (admin)
// ============================================================================
// · Activar, puntos por paso (cada paso se puede apagar), premio final (un
//   artículo de la tienda del club), plazos, límite mensual y vigencia.
// · Resultados: totales, ranking de los que más invitan y últimos invitados.
// El invitado recibe los puntos de bienvenida del club (se configuran en
// Puntos): acá solo se define lo que gana el que invita.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Gift, Loader2, Save, Trophy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { STEP_STATE_LABEL, TASK_COPY, TASK_ORDER, type ReferralTaskKey, type StepState } from '@/lib/referrals-ui'

interface Program {
  enabled: boolean
  tasks: Record<ReferralTaskKey, { enabled: boolean; points: number }>
  rewardStoreItemId: string | null
  rewardValidityDays: number
  secondOrderWindowDays: number
  monthlyInviteLimit: number
  startsAt: string | null
  endsAt: string | null
}

interface Overview {
  program: Program
  storeItems: Array<{ id: string; name: string; pointsCost: number; stock: number | null }>
  totals: { referrals: number; completed: number; withPurchase: number; rewardsGranted: number; pointsCredited: number }
  ranking: Array<{ memberId: string; name: string; invited: number; completed: number; points: number }>
  recent: Array<{ referralId: string; name: string; referrerName: string; joinedAt: string; steps: Record<ReferralTaskKey, StepState>; pointsEarned: number; completed: boolean }>
}

const labelCls = 'text-xs font-bold uppercase tracking-wider text-muted-foreground'
const inputCls = 'bg-muted/40 border-2 border-border/60 h-11 rounded-xl text-sm font-medium'
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
/** Fecha del input (día local) → ISO: inicio 00:00 y fin 23:59 hora de Argentina. */
const fromDateInput = (v: string, end: boolean) => (v ? new Date(`${v}T${end ? '23:59:59' : '00:00:00'}-03:00`).toISOString() : null)

export default function ReferralProgramSettings({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<Overview | null>(null)
  const [program, setProgram] = useState<Program | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/referrals`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo cargar el programa')
      setData(json)
      setProgram(json.program)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sin conexión')
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!program) return
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/referrals`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(program),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar')
      setProgram(json.program)
      toast.success(program.enabled ? 'Programa de referidos guardado y activo' : 'Programa de referidos guardado')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const setTask = (t: ReferralTaskKey, patch: Partial<{ enabled: boolean; points: number }>) =>
    setProgram((p) => (p ? { ...p, tasks: { ...p.tasks, [t]: { ...p.tasks[t], ...patch } } } : p))

  if (error && !data) {
    return (
      <Card className="rounded-[2rem] border-2">
        <CardContent className="p-8 space-y-3">
          <p role="alert" className="font-semibold text-destructive">{error}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </CardContent>
      </Card>
    )
  }
  if (!data || !program) {
    return (
      <Card className="rounded-[2rem] border-2">
        <CardContent className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" /></CardContent>
      </Card>
    )
  }

  const totalPoints = TASK_ORDER.reduce((s, t) => s + (program.tasks[t].enabled ? program.tasks[t].points : 0), 0)
  const rewardName = data.storeItems.find((i) => i.id === program.rewardStoreItemId)?.name

  return (
    <Card className="rounded-[2rem] border-2 border-border/60 overflow-hidden">
      <CardHeader className="p-8 pb-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-600 flex items-center justify-center"><UserPlus size={24} aria-hidden /></div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Invitá y ganá</CardTitle>
            <p className="text-xs text-muted-foreground font-medium">Tus socios traen clientes nuevos y ganan puntos por cada paso de su invitado</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-8">
        {/* Activar */}
        <div className="flex items-center justify-between gap-4 p-6 rounded-2xl bg-muted/30 border border-border/40">
          <div>
            <Label htmlFor="ref-enabled" className="text-base font-bold cursor-pointer">{program.enabled ? 'Programa activo' : 'Programa desactivado'}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {program.enabled ? 'Tus socios ven «Invitá y ganá» con su link en el menú.' : 'Activalo para que tus socios puedan invitar.'}
            </p>
          </div>
          <Switch id="ref-enabled" checked={program.enabled} onCheckedChange={(v) => setProgram({ ...program, enabled: v })} className="data-[state=checked]:bg-emerald-500" />
        </div>

        {/* Pasos */}
        <section aria-labelledby="ref-steps" className="space-y-3">
          <div>
            <h3 id="ref-steps" className="text-base font-bold">Puntos para el que invita, por cada paso de su amigo</h3>
            <p className="text-xs text-muted-foreground">El amigo recibe los puntos de bienvenida del club. Los puntos del registro se acreditan recién cuando el amigo hace su primera compra.</p>
          </div>
          <ul className="divide-y divide-border/50 rounded-2xl border-2 border-border/50">
            {TASK_ORDER.map((t, i) => (
              <li key={t} className={cn('flex flex-wrap items-center gap-4 p-4', !program.tasks[t].enabled && 'opacity-60')}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{TASK_COPY[t].title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t === 'second_order' ? `Segunda compra dentro de los ${program.secondOrderWindowDays} días desde la primera.` : t === 'visit' ? 'Primer pedido consumido en el local (QR de la mesa).' : TASK_COPY[t].detail}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`pts-${t}`} className="sr-only">Puntos por «{TASK_COPY[t].title}»</Label>
                  <Input
                    id={`pts-${t}`}
                    type="number"
                    min={0}
                    max={100000}
                    value={program.tasks[t].points}
                    disabled={!program.tasks[t].enabled}
                    onChange={(e) => setTask(t, { points: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) })}
                    className={cn(inputCls, 'w-24 text-right tabular-nums')}
                  />
                  <span className="text-xs text-muted-foreground">pts</span>
                  <Switch checked={program.tasks[t].enabled} onCheckedChange={(v) => setTask(t, { enabled: v })} aria-label={`Activar «${TASK_COPY[t].title}»`} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Premio */}
        <section aria-labelledby="ref-reward" className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ref-reward-item" className={labelCls}>Premio al completar todos los pasos</Label>
            <select
              id="ref-reward-item"
              value={program.rewardStoreItemId ?? ''}
              onChange={(e) => setProgram({ ...program, rewardStoreItemId: e.target.value || null })}
              className={cn(inputCls, 'w-full px-3')}
            >
              <option value="">Sin premio (solo puntos)</option>
              {data.storeItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}{i.stock !== null ? ` · stock ${i.stock}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {data.storeItems.length === 0 ? 'Cargá primero el premio como artículo en la Tienda del club.' : 'Se entrega sin costo de puntos, con un código para presentar en el local.'}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref-validity" className={labelCls}>Días para usar el premio</Label>
            <Input id="ref-validity" type="number" min={1} max={365} value={program.rewardValidityDays} onChange={(e) => setProgram({ ...program, rewardValidityDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} className={inputCls} />
          </div>
        </section>

        {/* Reglas */}
        <section aria-labelledby="ref-rules" className="space-y-3">
          <h3 id="ref-rules" className="text-base font-bold">Reglas</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ref-window" className={labelCls}>Plazo para la segunda compra (días)</Label>
              <Input id="ref-window" type="number" min={1} max={365} value={program.secondOrderWindowDays} onChange={(e) => setProgram({ ...program, secondOrderWindowDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref-limit" className={labelCls}>Invitados por socio cada 30 días (0 = sin límite)</Label>
              <Input id="ref-limit" type="number" min={0} max={1000} value={program.monthlyInviteLimit} onChange={(e) => setProgram({ ...program, monthlyInviteLimit: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })} className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref-start" className={labelCls}>Desde (opcional)</Label>
              <Input id="ref-start" type="date" value={toDateInput(program.startsAt)} onChange={(e) => setProgram({ ...program, startsAt: fromDateInput(e.target.value, false) })} className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref-end" className={labelCls}>Hasta (opcional)</Label>
              <Input id="ref-end" type="date" value={toDateInput(program.endsAt)} onChange={(e) => setProgram({ ...program, endsAt: fromDateInput(e.target.value, true) })} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Siempre: no vale invitarse a uno mismo, solo cuentan personas que nunca compraron ni eran socias, cada invitado tiene un solo referidor y si un pedido se cancela, se descuentan los puntos de ese paso.
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-orange-950 dark:bg-orange-950/30 dark:text-orange-100">
          <p>
            Por cada amigo que complete todo, el socio gana <strong>{totalPoints} puntos</strong>{rewardName ? <> y <strong>{rewardName}</strong></> : null}.
          </p>
          <Button onClick={save} disabled={saving} className="rounded-xl">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />} Guardar
          </Button>
        </div>

        {/* Resultados */}
        <section aria-labelledby="ref-results" className="space-y-4">
          <h3 id="ref-results" className="text-base font-bold">Resultados</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Invitados" value={data.totals.referrals} />
            <Stat label="Compraron" value={data.totals.withPurchase} />
            <Stat label="Completaron todo" value={data.totals.completed} />
            <Stat label="Premios entregados" value={data.totals.rewardsGranted} />
          </div>

          {data.ranking.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-bold"><Trophy size={16} aria-hidden className="text-amber-500" /> Los que más invitan</p>
              <div className="overflow-x-auto rounded-2xl border-2 border-border/50">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-4 py-2">Socio</th><th className="px-4 py-2 text-right">Invitados</th><th className="px-4 py-2 text-right">Completaron</th><th className="px-4 py-2 text-right">Puntos ganados</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {data.ranking.map((r) => (
                      <tr key={r.memberId}><td className="px-4 py-2 font-semibold">{r.name}</td><td className="px-4 py-2 text-right tabular-nums">{r.invited}</td><td className="px-4 py-2 text-right tabular-nums">{r.completed}</td><td className="px-4 py-2 text-right tabular-nums">{r.points}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.recent.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-bold">Últimos invitados</p>
              <div className="overflow-x-auto rounded-2xl border-2 border-border/50">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Invitado</th>
                      <th className="px-4 py-2">Lo invitó</th>
                      {TASK_ORDER.map((t) => <th key={t} className="px-3 py-2">{TASK_COPY[t].short}</th>)}
                      <th className="px-4 py-2 text-right">Puntos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {data.recent.map((r) => (
                      <tr key={r.referralId}>
                        <td className="px-4 py-2 font-semibold">{r.name}{r.completed && <Badge className="ml-2 bg-emerald-600"><Gift size={10} aria-hidden /> Completo</Badge>}</td>
                        <td className="px-4 py-2">{r.referrerName}</td>
                        {TASK_ORDER.map((t) => (
                          <td key={t} className="px-3 py-2">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', r.steps[t] === 'credited' ? 'bg-emerald-100 text-emerald-800' : r.steps[t] === 'pending' ? 'bg-amber-100 text-amber-800' : r.steps[t] === 'reverted' ? 'bg-red-100 text-red-800' : 'bg-muted text-muted-foreground')}>
                              {STEP_STATE_LABEL[r.steps[t]]}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right tabular-nums">{r.pointsEarned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Todavía no hay invitados. Cuando un socio comparta su link y un amigo se sume, lo vas a ver acá.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border-2 border-border/50 p-4">
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
