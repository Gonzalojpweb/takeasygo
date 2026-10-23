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
import { ChevronRight, Gift, Info, Loader2, Save, Scale, ShieldCheck, Trophy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ADMIN_AUTOMATIC_RULES, ADMIN_SETUP_STEPS, STEP_STATE_LABEL, TASK_COPY, TASK_ORDER, pesosAR, requiredSpendFor, type ReferralTaskKey, type StepState } from '@/lib/referrals-ui'

interface Program {
  enabled: boolean
  tasks: Record<ReferralTaskKey, { enabled: boolean; points: number }>
  rewardStoreItemId: string | null
  rewardValueCents: number | null
  rewardMaxCostPct: number
  minOrderCents: number
  minOrderByTask: Partial<Record<OrderTask, number | null>>
  rewardValidityDays: number
  secondOrderWindowDays: number
  monthlyInviteLimit: number
  startsAt: string | null
  endsAt: string | null
}

type OrderTask = 'first_online_order' | 'visit' | 'second_order'
const ORDER_TASKS: OrderTask[] = ['first_online_order', 'visit', 'second_order']

interface Overview {
  program: Program
  averageTicketCents: number | null
  storeItems: Array<{ id: string; name: string; pointsCost: number; stock: number | null; cashValueCents: number | null }>
  totals: { referrals: number; completed: number; withPurchase: number; rewardsGranted: number; pointsCredited: number; invitedSpendCents: number }
  ranking: Array<{ memberId: string; name: string; invited: number; completed: number; points: number }>
  recent: Array<{ referralId: string; name: string; referrerName: string; joinedAt: string; steps: Record<ReferralTaskKey, StepState>; pointsEarned: number; completed: boolean }>
}

const labelCls = 'text-xs font-bold uppercase tracking-wider text-muted-foreground'
const inputCls = 'bg-muted/40 border-2 border-border/60 h-11 rounded-xl text-sm font-medium'
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
/** Centavos ↔ pesos enteros en los inputs de plata. */
const toPesosInput = (cents: number | null | undefined) => (cents ? String(Math.round(cents / 100)) : '')
const fromPesosInput = (v: string) => Math.max(0, Math.round((Number(v.replace(/\./g, '').replace(',', '.')) || 0) * 100))
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
  const rewardItem = data.storeItems.find((i) => i.id === program.rewardStoreItemId) ?? null
  const rewardName = rewardItem?.name
  const needSpend = rewardItem ? requiredSpendFor(program.rewardValueCents, program.rewardMaxCostPct) : 0
  const hasPerTask = ORDER_TASKS.some((t) => program.minOrderByTask[t] != null)

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
        {/* Cómo funciona */}
        <section aria-labelledby="ref-how" className="space-y-4 rounded-2xl border-2 border-border/50 bg-muted/20 p-6">
          <h3 id="ref-how" className="flex items-center gap-2 text-base font-bold"><Info size={18} aria-hidden /> Cómo funciona</h3>
          <ol className="flex flex-wrap items-stretch gap-2 text-sm">
            {[
              { who: 'Socio', what: 'Comparte su link desde «Invitá y ganá» (menú → Socio del Club)' },
              { who: 'Amigo', what: 'Se suma al club con el link y recibe los puntos de bienvenida' },
              ...TASK_ORDER.filter((t) => t !== 'registered' && program.tasks[t].enabled).map((t) => ({ who: 'Amigo', what: TASK_COPY[t].title })),
              { who: 'Socio', what: rewardName ? `Gana puntos en cada paso y, al final, «${rewardName}»` : 'Gana puntos en cada paso (y el premio, si elegís uno)' },
            ].map((s, i, arr) => (
              <li key={i} className="flex items-center gap-2">
                <span className="rounded-xl border border-border/60 bg-background px-3 py-2">
                  <span className={cn('block text-[10px] font-black uppercase tracking-wider', s.who === 'Socio' ? 'text-orange-600' : 'text-teal-600')}>{s.who}</span>
                  {s.what}
                </span>
                {i < arr.length - 1 && <ChevronRight size={16} aria-hidden className="text-muted-foreground" />}
              </li>
            ))}
          </ol>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-bold">Qué tenés que hacer vos</p>
              <ol className="space-y-2">
                {ADMIN_SETUP_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-700">{i + 1}</span>
                    <span><strong>{s.title}.</strong> <span className="text-muted-foreground">{s.body}</span></span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16} aria-hidden className="text-emerald-600" /> Reglas que el sistema aplica siempre</p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {ADMIN_AUTOMATIC_RULES.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Costo para tu comercio: los puntos se canjean en tu tienda del club, y el premio llega recién cuando el amigo compró dos veces y fue al local. Si apagás el programa, los amigos que ya se sumaron siguen su recorrido; no se suman nuevos.
          </p>
        </section>

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
                    {t === 'second_order' ? `Segunda compra dentro de los ${program.secondOrderWindowDays} días desde la primera.` : t === 'visit' ? 'Primer pedido en el local: desde el QR de la mesa o cobrado en el POS con su celular.' : TASK_COPY[t].detail}
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
              onChange={(e) => {
                const id = e.target.value || null
                const item = data.storeItems.find((i) => i.id === id)
                // Si la tienda ya tiene el valor del premio, se usa para el tope de costo.
                setProgram({ ...program, rewardStoreItemId: id, rewardValueCents: item?.cashValueCents ?? (id ? program.rewardValueCents : null) })
              }}
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

        {/* Protección del margen */}
        <section aria-labelledby="ref-margin" className="space-y-5 rounded-2xl border-2 border-emerald-600/25 bg-emerald-50/40 p-6 dark:bg-emerald-950/15">
          <div className="space-y-1">
            <h3 id="ref-margin" className="flex items-center gap-2 text-base font-bold"><Scale size={18} aria-hidden className="text-emerald-700" /> Cuidá tu margen</h3>
            <p className="text-sm text-muted-foreground">
              Dos protecciones para que el programa traiga clientes que compran de verdad: que un café no cuente como «primera compra» y que el premio nunca cueste más de lo que dejó el invitado.
            </p>
          </div>

          {/* 1. Compra mínima */}
          <div className="space-y-3">
            <p className="text-sm font-bold">1. Compra mínima por pedido</p>
            <p className="text-sm text-muted-foreground">
              Un pedido del invitado cumple un paso solo si sus productos suman al menos este monto. Se mide ya con descuentos y <strong>sin el envío</strong>. Un pedido más chico se vende igual; solo que no suma para el programa.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="ref-min" className={labelCls}>Mínimo por pedido ($)</Label>
                <Input id="ref-min" inputMode="numeric" placeholder="0 = sin mínimo" value={toPesosInput(program.minOrderCents)} onChange={(e) => setProgram({ ...program, minOrderCents: fromPesosInput(e.target.value) })} className={cn(inputCls, 'w-44')} />
              </div>
              {data.averageTicketCents ? (
                <div className="text-sm">
                  <p className="text-muted-foreground">Tu ticket promedio (últimos 90 días): <strong className="text-foreground">{pesosAR(data.averageTicketCents)}</strong></p>
                  <button type="button" className="font-bold text-primary underline-offset-2 hover:underline" onClick={() => setProgram({ ...program, minOrderCents: Math.round(data.averageTicketCents! / 10000) * 10000 })}>
                    Usar mi ticket promedio
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Cuando haya pedidos entregados, te sugerimos tu ticket promedio.</p>
              )}
            </div>
            {program.minOrderCents === 0 && !hasPerTask && (
              <p className="flex items-start gap-2 rounded-xl border-2 border-amber-600/30 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                <Info size={16} aria-hidden className="mt-0.5 shrink-0" /> Sin mínimo, cualquier pedido cuenta, aunque sea un café. Te recomendamos usar tu ticket promedio.
              </p>
            )}
            <details className="rounded-xl border-2 border-border bg-background p-3" open={hasPerTask}>
              <summary className="cursor-pointer text-sm font-bold">Usar un mínimo distinto por paso (opcional)</summary>
              <p className="mt-2 text-xs text-muted-foreground">Por ejemplo, la visita al local con un mínimo más alto, porque en el salón el ticket suele ser mayor. Vacío = usa el mínimo general.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {ORDER_TASKS.map((t) => (
                  <div key={t} className="space-y-1.5">
                    <Label htmlFor={`ref-min-${t}`} className={labelCls}>{TASK_COPY[t].short} ($)</Label>
                    <Input
                      id={`ref-min-${t}`}
                      inputMode="numeric"
                      placeholder={program.minOrderCents ? `General: ${Math.round(program.minOrderCents / 100)}` : 'General'}
                      value={toPesosInput(program.minOrderByTask[t])}
                      onChange={(e) => setProgram({ ...program, minOrderByTask: { ...program.minOrderByTask, [t]: e.target.value.trim() ? fromPesosInput(e.target.value) : null } })}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* 2. Tope de costo del premio */}
          <div className="space-y-3 border-t border-emerald-600/20 pt-4">
            <p className="text-sm font-bold">2. Tope de costo del premio</p>
            <p className="text-sm text-muted-foreground">
              Elegí qué parte de lo que gastó el invitado estás dispuesto a devolver en premio. El sistema calcula solo cuánto tiene que haber gastado antes de entregarlo; si cambiás el premio por uno más caro, el mínimo sube solo.
            </p>
            {!rewardItem ? (
              <p className="text-sm text-muted-foreground">Elegí un premio arriba para configurar el tope.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="ref-reward-value" className={labelCls}>Valor del premio ($)</Label>
                    <Input id="ref-reward-value" inputMode="numeric" value={toPesosInput(program.rewardValueCents)} onChange={(e) => setProgram({ ...program, rewardValueCents: e.target.value.trim() ? fromPesosInput(e.target.value) : null })} className={cn(inputCls, 'w-40')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref-reward-pct" className={labelCls}>Tope (% de lo gastado)</Label>
                    <Input id="ref-reward-pct" type="number" min={0} max={100} value={program.rewardMaxCostPct} onChange={(e) => setProgram({ ...program, rewardMaxCostPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className={cn(inputCls, 'w-32')} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  El valor es lo que te cuesta o lo que cobrás ese producto; si la tienda ya lo tenía cargado, lo tomamos de ahí. Un tope de entre 10 % y 20 % es habitual en gastronomía.
                </p>
                {program.rewardMaxCostPct <= 0 ? (
                  <p className="flex items-start gap-2 rounded-xl border-2 border-amber-600/30 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                    <Info size={16} aria-hidden className="mt-0.5 shrink-0" /> Sin tope: el premio se entrega al completar los pasos, sin importar cuánto gastó el invitado.
                  </p>
                ) : !program.rewardValueCents ? (
                  <p role="alert" className="rounded-xl border-2 border-red-600/30 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:bg-red-950/30 dark:text-red-100">
                    Cargá el valor del premio para poder calcular el gasto mínimo.
                  </p>
                ) : (
                  <p className="rounded-xl border-2 border-emerald-600/30 bg-background p-3 text-sm">
                    Para entregar <strong>«{rewardName}»</strong> ({pesosAR(program.rewardValueCents)}), cada invitado tiene que haber gastado al menos{' '}
                    <strong className="text-emerald-700 dark:text-emerald-300">{pesosAR(needSpend)}</strong> en compras que cuentan. Así el premio es, como mucho, el {program.rewardMaxCostPct} % de lo que dejó.
                  </p>
                )}
              </>
            )}
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
            Por cada amigo que complete todo, el socio gana <strong>{totalPoints} puntos</strong>{rewardName ? <> y <strong>{rewardName}</strong>{needSpend > 0 && <> cuando el amigo haya gastado {pesosAR(needSpend)}</>}</> : null}.
            {program.minOrderCents > 0 && <> Cada pedido cuenta desde {pesosAR(program.minOrderCents)}.</>}
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
          {data.totals.referrals > 0 && (
            <p className="rounded-2xl border-2 border-border/50 p-4 text-sm">
              Los invitados ya compraron <strong>{pesosAR(data.totals.invitedSpendCents)}</strong> en pedidos que cuentan
              {program.rewardValueCents && data.totals.rewardsGranted > 0 ? (
                <> y los premios entregados valen <strong>{pesosAR(program.rewardValueCents * data.totals.rewardsGranted)}</strong></>
              ) : null}
              .
            </p>
          )}

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
