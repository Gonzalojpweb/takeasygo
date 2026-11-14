'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Save, RotateCcw, Loader2, ShieldCheck, ShieldAlert, Ban } from 'lucide-react'
import {
  DEFAULT_DISCOUNT_POLICY,
  DISCOUNT_ACTOR_ROLES,
  DISCOUNT_REASONS,
  DISCOUNT_REASON_IDS,
  DISCOUNT_ROLE_LABELS,
  evaluateDiscount,
  validateDiscountPolicyInput,
  type DiscountActorRole,
  type DiscountPolicy,
  type DiscountReason,
} from '@takeasygo/business/browser'

// ============================================================================
// Política de descuentos del POS — formulario del panel (14/11/2026)
// ============================================================================
// Por rol: si puede descontar, hasta cuánto SIN PIN (autonomía) y el máximo
// aun con autorización. Motivos habilitados y con observación obligatoria.
// El simulador usa la MISMA función que el server y el POS (evaluateDiscount)
// para mostrar qué pasaría con un descuento antes de guardar.
// Validación final: server (validateDiscountPolicyInput) con control de versión.
// ============================================================================

interface PolicyResponse {
  version: number
  policy: DiscountPolicy
  updatedAt: string | null
  updatedByName: string | null
  canEdit: boolean
}

/** «35.000» / «35000,50» → centavos. Vacío → null (sin tope). Inválido → NaN. */
function toCents(text: string): number | null {
  const t = text.trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!t) return null
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN
  return Math.round(Number(normalized) * 100)
}

function centsText(cents: number | null): string {
  if (cents === null) return ''
  return (cents / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

const money = (cents: number) => (cents / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

type RoleForm = { enabled: boolean; autonomyPercent: string; autonomyCents: string; maxPercent: string; maxCents: string }

function toForm(policy: DiscountPolicy): Record<DiscountActorRole, RoleForm> {
  const out = {} as Record<DiscountActorRole, RoleForm>
  for (const role of DISCOUNT_ACTOR_ROLES) {
    const r = policy.roles[role]
    out[role] = {
      enabled: r.enabled,
      autonomyPercent: String(r.autonomyPercent),
      autonomyCents: centsText(r.autonomyCents),
      maxPercent: String(r.maxPercent),
      maxCents: centsText(r.maxCents),
    }
  }
  return out
}

function fromForm(roles: Record<DiscountActorRole, RoleForm>, allowed: DiscountReason[], notes: DiscountReason[]): unknown {
  const out: Record<string, unknown> = {}
  for (const role of DISCOUNT_ACTOR_ROLES) {
    const r = roles[role]
    out[role] = {
      enabled: r.enabled,
      autonomyPercent: Number(r.autonomyPercent),
      autonomyCents: toCents(r.autonomyCents),
      maxPercent: Number(r.maxPercent),
      maxCents: toCents(r.maxCents),
    }
  }
  return { roles: out, allowedReasons: allowed, requireNoteFor: notes }
}

export function DiscountPolicyForm({ tenantSlug }: { tenantSlug: string }) {
  const [loaded, setLoaded] = useState<PolicyResponse | null>(null)
  const [roles, setRoles] = useState<Record<DiscountActorRole, RoleForm>>(() => toForm(DEFAULT_DISCOUNT_POLICY))
  const [allowed, setAllowed] = useState<DiscountReason[]>([...DEFAULT_DISCOUNT_POLICY.allowedReasons])
  const [notes, setNotes] = useState<DiscountReason[]>([...DEFAULT_DISCOUNT_POLICY.requireNoteFor])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [simTotal, setSimTotal] = useState('35.000')
  const [simFinal, setSimFinal] = useState('28.000')

  const apply = (data: PolicyResponse) => {
    setLoaded(data)
    setRoles(toForm(data.policy))
    setAllowed([...data.policy.allowedReasons])
    setNotes([...data.policy.requireNoteFor])
  }

  useEffect(() => {
    let alive = true
    fetch(`/api/${tenantSlug}/pos-discounts/policy`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'No se pudo leer la política')
        if (alive) apply(data as PolicyResponse)
      })
      .catch((err: Error) => alive && setError(err.message))
    return () => { alive = false }
  }, [tenantSlug])

  const draft = useMemo(() => validateDiscountPolicyInput(fromForm(roles, allowed, notes)), [roles, allowed, notes])
  const canEdit = loaded?.canEdit === true

  const save = async () => {
    if (!loaded || !draft.ok) return
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/pos-discounts/policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: loaded.version, policy: draft.policy }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      apply(data as PolicyResponse)
      toast.success('Política guardada: rige desde ahora en todas las cajas')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const setRole = (role: DiscountActorRole, patch: Partial<RoleForm>) => setRoles((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }))
  const toggle = (list: DiscountReason[], id: DiscountReason) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  // Simulador: cuenta y lo que se quiere cobrar.
  const simGross = toCents(simTotal)
  const simFinalCents = toCents(simFinal)
  const simOk = simGross !== null && !Number.isNaN(simGross) && simGross > 0 && simFinalCents !== null && !Number.isNaN(simFinalCents) && simFinalCents < simGross
  const simDiscount = simOk ? simGross! - simFinalCents! : 0

  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>
  if (!loaded) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Cargando política…</p>

  const input = 'w-24 rounded-xl border-2 border-border/60 bg-background px-2 py-1 text-right text-sm tabular-nums disabled:opacity-60'

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
        <h2 className="text-sm font-black">Quién puede descontar y hasta cuánto</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Se mide sobre <strong>toda la cuenta</strong> (la mesa entera o la venta): varios descuentos chicos suman.
          «Sin autorización» es lo que cada rol descuenta solo; más arriba hace falta el PIN de alguien que lo cubra
          (un encargado autoriza hasta su propio límite; más arriba, un administrador). «Máximo» es el tope aun con
          autorización. Monto vacío = sin tope por monto. Quitar o bajar un descuento nunca pide PIN.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4">Rol</th>
                <th className="py-2 pr-4">Puede descontar</th>
                <th className="py-2 pr-4 text-right">Sin autorización: %</th>
                <th className="py-2 pr-4 text-right">y hasta $</th>
                <th className="py-2 pr-4 text-right">Máximo: %</th>
                <th className="py-2 text-right">y hasta $</th>
              </tr>
            </thead>
            <tbody>
              {DISCOUNT_ACTOR_ROLES.map((role) => {
                const r = roles[role]
                const locked = !canEdit
                return (
                  <tr key={role} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-bold">{DISCOUNT_ROLE_LABELS[role]}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={r.enabled}
                        disabled={locked || role === 'admin'}
                        onChange={(e) => setRole(role, { enabled: e.target.checked })}
                        aria-label={`${DISCOUNT_ROLE_LABELS[role]} puede descontar`}
                      />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <input className={input} inputMode="numeric" value={r.autonomyPercent} disabled={locked || !r.enabled} onChange={(e) => setRole(role, { autonomyPercent: e.target.value.replace(/\D/g, '') })} aria-label={`${DISCOUNT_ROLE_LABELS[role]}: porcentaje sin autorización`} />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <input className={input} inputMode="decimal" placeholder="sin tope" value={r.autonomyCents} disabled={locked || !r.enabled} onChange={(e) => setRole(role, { autonomyCents: e.target.value })} aria-label={`${DISCOUNT_ROLE_LABELS[role]}: monto sin autorización`} />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <input className={input} inputMode="numeric" value={r.maxPercent} disabled={locked || !r.enabled} onChange={(e) => setRole(role, { maxPercent: e.target.value.replace(/\D/g, '') })} aria-label={`${DISCOUNT_ROLE_LABELS[role]}: porcentaje máximo`} />
                    </td>
                    <td className="py-2 text-right">
                      <input className={input} inputMode="decimal" placeholder="sin tope" value={r.maxCents} disabled={locked || !r.enabled} onChange={(e) => setRole(role, { maxCents: e.target.value })} aria-label={`${DISCOUNT_ROLE_LABELS[role]}: monto máximo`} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">El mozo nunca descuenta: lo hace la caja. El administrador siempre puede descontar (sus límites sí se pueden ajustar).</p>
      </section>

      <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
        <h2 className="text-sm font-black">Motivos</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Los que se ofrecen en el POS y cuáles exigen observación. «Otro» siempre la exige. Un producto que no está
          se quita de la cuenta (vuelve al stock), no se descuenta.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {DISCOUNT_REASON_IDS.map((id) => (
            <div key={id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/30 px-3 py-2 text-sm">
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" className="h-4 w-4" checked={allowed.includes(id)} disabled={!canEdit} onChange={() => setAllowed((l) => toggle(l, id))} />
                {DISCOUNT_REASONS[id]}
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" className="h-4 w-4" checked={id === 'other' || notes.includes(id)} disabled={!canEdit || id === 'other'} onChange={() => setNotes((l) => toggle(l, id))} />
                Observación obligatoria
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
        <h2 className="text-sm font-black">Probar la política</h2>
        <p className="mt-1 text-xs text-muted-foreground">Qué pasaría en la caja con esta configuración (antes de guardarla).</p>
        <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs font-bold">Total de la cuenta ($)
            <input className={input + ' w-32'} inputMode="decimal" value={simTotal} onChange={(e) => setSimTotal(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">Importe a cobrar ($)
            <input className={input + ' w-32'} inputMode="decimal" value={simFinal} onChange={(e) => setSimFinal(e.target.value)} />
          </label>
          {simOk && <span className="pb-1 text-xs text-muted-foreground">Descuento: {money(simDiscount)} ({Math.ceil((simDiscount * 100) / simGross!)} %)</span>}
        </div>
        {simOk && draft.ok && (
          <ul className="mt-3 space-y-1 text-sm">
            {DISCOUNT_ACTOR_ROLES.map((role) => {
              const d = evaluateDiscount(draft.policy, role, { grossCents: simGross!, discountCents: simDiscount, previousDiscountCents: 0 })
              return (
                <li key={role} className="flex items-start gap-2">
                  {d.kind === 'allow' ? <ShieldCheck size={16} className="mt-0.5 text-emerald-600" /> : d.kind === 'approval' ? <ShieldAlert size={16} className="mt-0.5 text-amber-600" /> : <Ban size={16} className="mt-0.5 text-red-600" />}
                  <span><strong>{DISCOUNT_ROLE_LABELS[role]}:</strong> {d.kind === 'allow' ? 'lo hace solo, sin PIN.' : d.message}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <>
            <button
              type="button"
              onClick={save}
              disabled={saving || !draft.ok}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar política
            </button>
            <button type="button" onClick={() => apply(loaded)} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl border-2 border-border/60 px-4 py-3 text-sm font-bold">
              <RotateCcw size={16} /> Descartar cambios
            </button>
            {!draft.ok && <span className="text-sm font-bold text-red-600" role="alert">{draft.error}</span>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Solo el administrador puede cambiar la política.</p>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Versión {loaded.version}
          {loaded.updatedAt ? ` · ${new Date(loaded.updatedAt).toLocaleString('es-AR')}` : ' · valores de fábrica'}
          {loaded.updatedByName ? ` · ${loaded.updatedByName}` : ''}
        </span>
      </div>
    </div>
  )
}
