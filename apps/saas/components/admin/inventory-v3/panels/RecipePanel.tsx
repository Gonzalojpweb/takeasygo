'use client'

// ============================================================================
// Editor de recetas — un plato, sus variantes, en un panel estable
// ============================================================================
// · Variantes visibles con su estado: con receta, igual a la base, o sin
//   confirmar (esas ventas NO descuentan: D-26).
// · Insumos existentes o nuevos sin salir del panel; sugerencias del
//   diccionario como punto de partida (nunca se guardan sin revisar).
// · Guardar = confirmar el resumen "por porción se descuenta…".
// · Al guardar, "Siguiente pendiente" lleva al próximo plato sin volver a
//   la lista. Un error nunca borra lo cargado.
// ============================================================================

import { useMemo, useState } from 'react'
import { ArrowRight, CopyPlus, Sparkles } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { DishSuggestion, DishView, RecipesData, SkuOption } from '../data/types'
import {
  addRow,
  copyFromBase,
  draftFrom,
  draftPayload,
  draftSummary,
  isDirty,
  validateDraft,
  type DraftSku,
  type RecipeDraft,
} from '@/lib/inventory/ui/recipe-draft'
import { UNIT_SHORT, pesos } from '@/lib/inventory/ui/format'
import { ErrorBlock, LoadingBlock, Notice, Panel, Spinner, StatusTag, btnGhost, btnPrimary, btnSecondary } from '../ui'
import RowsEditor, { type NewSkuInput } from '../RowsEditor'
import type { PanelProps } from './PanelHost'

const VARIANT_STATUS: Record<string, { tone: 'ok' | 'warning' | 'neutral'; label: string }> = {
  own: { tone: 'ok', label: 'Con receta' },
  base_confirmed: { tone: 'ok', label: 'Igual a la base' },
  variant_unconfirmed: { tone: 'warning', label: 'Sin confirmar: no descuenta' },
  no_recipe: { tone: 'neutral', label: 'Sin receta' },
}

type Step = 'edit' | 'confirm' | 'saved'

export default function RecipePanel({ ctx, onClose, onSwitch, onChanged, menuItemId, variantName }: PanelProps & { menuItemId: string; variantName: string | null }) {
  // Sin ctx.version en la clave: este panel recarga solo (view.reload) y no
  // debe remontarse al guardar (perdería el paso "guardado").
  const view = useResource(`${ctx.tenantSlug}|recipes-panel|${ctx.location.id}`, (signal) =>
    invApi<RecipesData>(ctx.tenantSlug, `recipes?locationId=${ctx.location.id}`, { signal }),
  )
  const dish = view.data?.items.find((i) => i.menuItemId === menuItemId) ?? null

  if (view.status === 'loading' || (!dish && view.status === 'ready' && view.refreshing)) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Receta">
        <LoadingBlock label="Cargando la receta" />
      </Panel>
    )
  }
  if (view.status === 'error' && !view.data) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Receta">
        <ErrorBlock error={view.error} onRetry={view.reload} what="la receta" />
      </Panel>
    )
  }
  if (!dish) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Receta">
        <Notice tone="error">Este plato ya no está en el menú de la sede.</Notice>
      </Panel>
    )
  }
  return (
    <Editor
      key={`${dish.menuItemId}|${variantName ?? ''}`}
      ctx={ctx}
      dish={dish}
      all={view.data!.items}
      initialVariant={variantName && dish.variantStates.some((v) => v.name === variantName) ? variantName : null}
      onClose={onClose}
      onSwitch={onSwitch}
      onChanged={() => {
        onChanged()
        view.reload()
      }}
    />
  )
}

function Editor({
  ctx,
  dish,
  all,
  initialVariant,
  onClose,
  onSwitch,
  onChanged,
}: Omit<PanelProps, 'onChanged'> & { dish: DishView; all: DishView[]; initialVariant: string | null; onChanged: () => void }) {
  const [target, setTarget] = useState<string | null>(initialVariant)
  const existingFor = (v: string | null) => (v === null ? dish.base : dish.variantStates.find((x) => x.name === v)?.recipe ?? null)
  const makeDraft = (v: string | null) => draftFrom(dish, v, existingFor(v))
  const [original, setOriginal] = useState<RecipeDraft>(() => makeDraft(initialVariant))
  const [draft, setDraft] = useState<RecipeDraft>(original)
  const [step, setStep] = useState<Step>('edit')
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [extraSkus, setExtraSkus] = useState<SkuOption[]>([])
  const [confirmRemove, setConfirmRemove] = useState(false)

  const skus = useMemo(() => {
    const m = new Map<string, DraftSku>()
    for (const s of [...ctx.skus, ...extraSkus]) m.set(s._id, s)
    return m
  }, [ctx.skus, extraSkus])
  const baseExists = Boolean(dish.base)
  const validation = validateDraft(draft, skus, { baseExists })
  const dirty = isDirty(draft, original)
  const existing = existingFor(target)

  const suggestions = useResource(
    !dish.base && target === null ? `${ctx.tenantSlug}|suggest|${ctx.location.id}` : null,
    (signal) => invApi<{ dishes: Array<{ menuItemId: string; suggestions: DishSuggestion[] }> }>(ctx.tenantSlug, `recipes/suggestions?locationId=${ctx.location.id}`, { signal }),
  )
  const dishSuggestions = suggestions.data?.dishes.find((d) => d.menuItemId === dish.menuItemId)?.suggestions ?? []

  function switchTarget(v: string | null) {
    if (dirty) {
      setNotice('Guardá o descartá los cambios antes de pasar a otra variante.')
      return
    }
    const d = makeDraft(v)
    setTarget(v)
    setOriginal(d)
    setDraft(d)
    setStep('edit')
    setShowErrors(false)
    setServerError(null)
    setNotice(null)
    setConfirmRemove(false)
  }

  async function createSku(input: NewSkuInput): Promise<SkuOption | null> {
    setServerError(null)
    const res = await invApi<{ sku: SkuOption }>(ctx.tenantSlug, 'skus', {
      method: 'POST',
      body: { name: input.name, category: input.category, canonicalUnit: input.canonicalUnit, businessImpact: 'medium' },
    })
    if (!res.ok) {
      setServerError(res.error.message)
      return null
    }
    setExtraSkus((x) => [...x, res.data.sku])
    ctx.refreshCatalog()
    return res.data.sku
  }

  async function applySuggestions() {
    setBusy(true)
    setServerError(null)
    let next = draft
    const created: SkuOption[] = []
    const failed: string[] = []
    for (const s of dishSuggestions) {
      let skuId = s.existingSkuId
      if (!skuId) {
        const res = await invApi<{ sku: SkuOption }>(ctx.tenantSlug, 'skus', {
          method: 'POST',
          body: { name: s.name, category: s.category, canonicalUnit: s.canonicalUnit, businessImpact: s.businessImpact },
        })
        if (!res.ok) {
          failed.push(s.name)
          continue
        }
        created.push(res.data.sku)
        skuId = res.data.sku._id
      }
      const sku = skus.get(skuId) ?? created.find((c) => c._id === skuId)
      if (sku) next = addRow(next, sku, String(s.quantity).replace('.', ','), s.unit)
    }
    setExtraSkus((x) => [...x, ...created])
    setDraft(next)
    setBusy(false)
    if (created.length) ctx.refreshCatalog()
    setNotice(
      `Agregamos ${next.rows.length} insumos típicos de este plato. Son un punto de partida: ajustá las cantidades a tu porción antes de guardar.` +
        (failed.length ? ` No se pudieron crear: ${failed.join(', ')}.` : ''),
    )
  }

  async function save() {
    setBusy(true)
    setServerError(null)
    const res = await invApi(ctx.tenantSlug, 'recipes', { method: 'PUT', body: draftPayload(draft, ctx.location.id) })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      setStep('edit')
      return
    }
    setOriginal(draft)
    setStep('saved')
    onChanged()
  }

  async function remove() {
    if (!existing) return
    setBusy(true)
    const res = await invApi(ctx.tenantSlug, `recipes?recipeKey=${encodeURIComponent(existing.recipeKey)}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    const d = draftFrom(dish, target, null)
    setOriginal(d)
    setDraft(d)
    setConfirmRemove(false)
    setNotice(target ? `La variante ${target} quedó sin receta: sus ventas no descuentan.` : 'El plato quedó sin receta: sus ventas no descuentan.')
    onChanged()
  }

  // Próximo pendiente: primero otras variantes de este plato, después el plato más vendido sin resolver.
  const nextPending = useMemo(() => {
    const own = dish.variantStates.find((v) => v.name !== target && (v.status === 'variant_unconfirmed' || v.status === 'no_recipe'))
    if (own && dish.base) return { menuItemId: dish.menuItemId, variantName: own.name, label: `${dish.name} ${own.name}` }
    const other = all.find((d) => d.menuItemId !== dish.menuItemId && (d.coverage === 'no_recipe' || d.coverage === 'variants_pending'))
    if (!other) return null
    const v = other.base ? other.variantStates.find((x) => x.status === 'variant_unconfirmed' || x.status === 'no_recipe')?.name ?? null : null
    return { menuItemId: other.menuItemId, variantName: v, label: v ? `${other.name} ${v}` : other.name }
  }, [all, dish, target])

  const title = target ? `${dish.name} · ${target}` : dish.name
  const recipeView = existing

  // ── Guardado ──────────────────────────────────────────────────────────────
  if (step === 'saved') {
    return (
      <Panel
        open
        onOpenChange={(o) => !o && onClose()}
        title={title}
        footer={
          <div className="flex flex-wrap gap-2">
            {nextPending ? (
              <button type="button" className={btnPrimary} autoFocus onClick={() => onSwitch({ type: 'recipe', menuItemId: nextPending.menuItemId, variantName: nextPending.variantName })}>
                Siguiente: {nextPending.label} <ArrowRight size={18} aria-hidden />
              </button>
            ) : (
              <button type="button" className={btnPrimary} autoFocus onClick={onClose}>
                Listo
              </button>
            )}
            <button type="button" className={btnSecondary} onClick={() => setStep('edit')}>
              Seguir editando
            </button>
          </div>
        }
      >
        <Notice tone="success">
          <p className="font-bold">Receta guardada.</p>
          <p className="mt-1">
            {draft.mode === 'same_as_base'
              ? `Cada ${dish.name} ${target} vendido descuenta lo mismo que la receta base.`
              : `Cada ${title} vendido descuenta estos insumos. Las ventas anteriores conservan la receta con la que se vendieron.`}
          </p>
        </Notice>
        {!nextPending && <p className="mt-4 text-sm text-muted-foreground">No quedan platos pendientes en esta sede.</p>}
      </Panel>
    )
  }

  // ── Confirmación ──────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <Panel
        open
        onOpenChange={(o) => !o && onClose()}
        title="Confirmá la receta"
        description={title}
        footer={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={save} disabled={busy} autoFocus>
              {busy && <Spinner label="Guardando receta" />} Confirmar y guardar
            </button>
            <button type="button" className={btnSecondary} onClick={() => setStep('edit')} disabled={busy}>
              Volver
            </button>
          </div>
        }
      >
        <p className="text-sm font-bold">Por cada porción vendida se va a descontar:</p>
        <ul className="mt-3 space-y-2">
          {draftSummary(draft, skus, UNIT_SHORT).map((line) => (
            <li key={line} className="rounded-xl border-2 border-border px-3 py-2 text-sm font-semibold">
              {line}
            </li>
          ))}
        </ul>
        {ctx.location.status !== 'active' && (
          <p className="mt-4 text-sm text-muted-foreground">La sede todavía no está activa: va a descontar cuando se active el inventario.</p>
        )}
      </Panel>
    )
  }

  // ── Edición ───────────────────────────────────────────────────────────────
  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={`${dish.categoryName}${dish.soldLast30d ? ` · ${dish.soldLast30d} vendidos en 30 días` : ''}`}
      wide
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={() => {
              setShowErrors(true)
              if (validation.valid) setStep('confirm')
            }}
          >
            Guardar receta
          </button>
          {dirty && (
            <button type="button" className={btnGhost} onClick={() => setDraft(original)}>
              Descartar cambios
            </button>
          )}
          {recipeView && !confirmRemove && (
            <button type="button" className={`${btnGhost} ml-auto text-red-700 dark:text-red-300`} onClick={() => setConfirmRemove(true)}>
              Quitar receta
            </button>
          )}
          {confirmRemove && (
            <span className="ml-auto flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar quitar receta">
              <span className="text-sm font-semibold">¿Quitar? Sus ventas dejan de descontar.</span>
              <button type="button" className={btnSecondary} onClick={remove} disabled={busy}>
                Sí, quitar
              </button>
              <button type="button" className={btnGhost} onClick={() => setConfirmRemove(false)}>
                No
              </button>
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {serverError && <Notice tone="error">{serverError} Lo que cargaste sigue acá.</Notice>}
        {notice && <Notice tone="info">{notice}</Notice>}

        {dish.variantStates.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">¿Qué receta estás editando?</legend>
            <div className="flex flex-wrap gap-2">
              <VariantChoice label="Base" status={dish.base ? 'own' : 'no_recipe'} selected={target === null} onSelect={() => switchTarget(null)} />
              {dish.variantStates.map((v) => (
                <VariantChoice key={v.name} label={v.name} status={v.status} selected={target === v.name} onSelect={() => switchTarget(v.name)} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cada variante necesita su receta o confirmar que consume igual que la base. Si no, sus ventas no descuentan.
            </p>
          </fieldset>
        )}

        {target !== null && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">¿Cómo consume «{target}»?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border-2 border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="mode" className="mt-0.5 size-4" checked={draft.mode === 'own'} onChange={() => setDraft({ ...draft, mode: 'own' })} />
                <span>
                  <span className="block font-bold">Tiene su propia receta</span>
                  <span className="text-muted-foreground">Ej.: el doble lleva dos medallones.</span>
                </span>
              </label>
              <label className={`flex min-h-11 items-start gap-2 rounded-xl border-2 border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 ${baseExists ? 'cursor-pointer' : 'opacity-60'}`}>
                <input type="radio" name="mode" className="mt-0.5 size-4" disabled={!baseExists} checked={draft.mode === 'same_as_base'} onChange={() => setDraft({ ...draft, mode: 'same_as_base' })} />
                <span>
                  <span className="block font-bold">Igual que la base</span>
                  <span className="text-muted-foreground">{baseExists ? 'Cambia el nombre o el precio, no lo que lleva.' : 'Primero cargá la receta base.'}</span>
                </span>
              </label>
            </div>
            {showErrors && validation.form && draft.mode === 'same_as_base' && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{validation.form}</p>}
          </fieldset>
        )}

        {draft.mode === 'own' && (
          <section aria-labelledby="ingredients-title" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="ingredients-title" className="text-base font-black">
                Insumos por porción
              </h3>
              <div className="flex flex-wrap gap-2">
                {target !== null && dish.base && draft.rows.length === 0 && (
                  <button type="button" className={btnSecondary} onClick={() => setDraft(copyFromBase(draft, dish.base!.items))}>
                    <CopyPlus size={16} aria-hidden /> Partir de la base
                  </button>
                )}
                {target === null && !dish.base && dishSuggestions.length > 0 && draft.rows.length === 0 && (
                  <button type="button" className={btnSecondary} onClick={applySuggestions} disabled={busy}>
                    {busy ? <Spinner label="Agregando sugerencias" /> : <Sparkles size={16} aria-hidden />} Sugerir insumos ({dishSuggestions.length})
                  </button>
                )}
              </div>
            </div>

            {draft.rows.length === 0 && (
              <p className="rounded-xl border-2 border-dashed border-border p-4 text-sm text-muted-foreground">
                Buscá abajo cada insumo que lleva una porción. Si no existe, lo creás ahí mismo.
              </p>
            )}
            <RowsEditor
              rows={draft.rows}
              onChange={(rows) => setDraft({ ...draft, rows })}
              skus={skus}
              errors={showErrors ? validation.rows : {}}
              onCreateSku={createSku}
            />
            {showErrors && validation.form && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{validation.form}</p>}
          </section>
        )}

        {recipeView && ctx.caps.read && (
          <p className="text-sm text-muted-foreground">
            Costo actual por porción: <strong className="text-foreground">{pesos(recipeView.costCents)}</strong>
            {recipeView.foodCostPct !== null && ` (${recipeView.foodCostPct} % del precio)`}
            {recipeView.missingCost > 0 && ' · a algunos insumos les falta precio'}
          </p>
        )}
      </div>
    </Panel>
  )
}

function VariantChoice({ label, status, selected, onSelect }: { label: string; status: string; selected: boolean; onSelect: () => void }) {
  const s = VARIANT_STATUS[status] ?? VARIANT_STATUS.no_recipe
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-11 flex-col items-start rounded-xl border-2 px-3 py-1.5 text-left text-sm ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <span className="font-bold">{label}</span>
      <StatusTag tone={s.tone}>{s.label}</StatusTag>
    </button>
  )
}
