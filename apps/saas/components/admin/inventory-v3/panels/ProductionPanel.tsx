'use client'

// ============================================================================
// Registrar producción — "hice 2 tandas de salsa"
// ============================================================================
// Descuenta los insumos de las tandas y suma el elaborado al depósito, con
// su costo. Si se pesó lo obtenido, se registra lo real (no lo teórico).
// ============================================================================

import { useState } from 'react'
import { CookingPot } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import { newClientEventId, parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_LONG, formatQty } from '@/lib/inventory/ui/format'
import { EmptyBlock, ErrorBlock, Field, LoadingBlock, Notice, Panel, Spinner, btnPrimary, inputClass } from '../ui'
import { resolveStorage, type PanelProps } from './PanelHost'
import type { PreparationView } from './PreparationPanel'

export default function ProductionPanel({ ctx, onClose, onChanged, recipeId }: PanelProps & { recipeId: string | null }) {
  const view = useResource(`${ctx.tenantSlug}|preparations|${ctx.location.id}`, (signal) =>
    invApi<{ preparations: PreparationView[] }>(ctx.tenantSlug, `recipes?locationId=${ctx.location.id}`, { signal }),
  )
  const storage = resolveStorage(ctx, null)
  const [clientEventId, setClientEventId] = useState(newClientEventId)
  const [selected, setSelected] = useState(recipeId ?? '')
  const [batches, setBatches] = useState('1')
  const [actual, setActual] = useState('')
  const [errors, setErrors] = useState<{ batches?: string; actual?: string; prep?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ outputQuantity: number; unit: string } | null>(null)

  const preps = view.data?.preparations ?? []
  const prep = preps.find((p) => p.recipeId === (selected || preps[0]?.recipeId)) ?? null
  const out = prep ? ctx.skus.find((s) => s._id === prep.outputSkuId) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const b = parseDecimal(batches)
    const a = actual.trim() ? parseDecimal(actual) : null
    const next: typeof errors = {}
    if (!prep) next.prep = 'Elegí qué se produjo'
    if (b === null || b <= 0) next.batches = 'Cantidad de tandas mayor a 0'
    if (actual.trim() && (a === null || a <= 0)) next.actual = 'Cantidad inválida'
    setErrors(next)
    if (Object.keys(next).length || !prep || !storage || b === null) return
    setBusy(true)
    setServerError(null)
    const res = await invApi<{ outputQuantity: number; unit: string }>(ctx.tenantSlug, 'production', {
      method: 'POST',
      body: { clientEventId, recipeId: prep.recipeId, storageLocationId: storage, batches: b, ...(a !== null ? { actualOutputQuantity: a } : {}) },
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setDone(res.data)
    onChanged()
  }

  if (view.status === 'loading') {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Registrar producción">
        <LoadingBlock rows={2} />
      </Panel>
    )
  }
  if (view.status === 'error' && !view.data) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Registrar producción">
        <ErrorBlock error={view.error} onRetry={view.reload} what="las preparaciones" />
      </Panel>
    )
  }
  if (done) {
    return (
      <Panel
        open
        onOpenChange={(o) => !o && onClose()}
        title="Producción registrada"
        footer={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={onClose} autoFocus>
              Listo
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setDone(null)
                setActual('')
                setClientEventId(newClientEventId())
              }}
            >
              Registrar otra
            </button>
          </div>
        }
      >
        <Notice tone="success">Se sumaron {formatQty(done.outputQuantity, done.unit)} de {prep?.name} y se descontaron sus insumos.</Notice>
      </Panel>
    )
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Registrar producción"
      footer={
        preps.length > 0 ? (
          <button type="submit" form="production-form" className={`${btnPrimary} w-full sm:w-auto`} disabled={busy}>
            {busy ? <Spinner label="Registrando producción" /> : <CookingPot size={18} aria-hidden />} Registrar
          </button>
        ) : undefined
      }
    >
      {preps.length === 0 ? (
        <EmptyBlock icon={<CookingPot size={28} />} title="No hay preparaciones cargadas">
          Primero cargá una preparación (salsa, masa…) en Recetas → Preparaciones.
        </EmptyBlock>
      ) : (
        <form id="production-form" onSubmit={submit} className="space-y-5" noValidate>
          {serverError && <Notice tone="error">{serverError} Lo que escribiste sigue acá.</Notice>}
          <Field label="¿Qué se produjo?" error={errors.prep}>
            {(a11y) => (
              <select {...a11y} value={prep?.recipeId ?? ''} onChange={(e) => setSelected(e.target.value)} className={inputClass}>
                {preps.map((p) => (
                  <option key={p.recipeId} value={p.recipeId}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="Tandas"
            error={errors.batches}
            hint={prep?.outputQuantity && out ? `Una tanda rinde ${formatQty(prep.outputQuantity, out.canonicalUnit)}.` : undefined}
          >
            {(a11y) => <input {...a11y} inputMode="decimal" value={batches} onChange={(e) => setBatches(e.target.value)} className={inputClass} />}
          </Field>
          <Field label={`Lo que salió realmente (${out ? UNIT_LONG[out.canonicalUnit] : 'opcional'}, opcional)`} error={errors.actual} hint="Si lo pesaste, el sistema usa lo real en vez de lo teórico.">
            {(a11y) => <input {...a11y} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} className={inputClass} />}
          </Field>
        </form>
      )}
    </Panel>
  )
}
