'use client'

// ============================================================================
// Modificador — qué agrega o quita una opción del menú, por porción
// ============================================================================
// "Extra queso" +30 g de queso · "Sin cebolla" −20 g de cebolla. Aplica en
// todos los platos donde se elija la opción. Sin filas = sin efecto.
// ============================================================================

import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { SkuOption } from '../data/types'
import { rowsToItems, validateRows, type DraftRow, type DraftSku } from '@/lib/inventory/ui/recipe-draft'
import { ErrorBlock, LoadingBlock, Notice, Panel, Spinner, btnPrimary, btnSecondary } from '../ui'
import RowsEditor, { type NewSkuInput } from '../RowsEditor'
import type { PanelProps } from './PanelHost'

interface Rule {
  _id: string
  optionName: string
  groupName: string | null
  items: Array<{ skuId: string; quantity: number; unit: string }>
  isActive: boolean
}

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function ModifierPanel({ ctx, onClose, onChanged, optionName }: PanelProps & { optionName: string }) {
  const rules = useResource(`${ctx.tenantSlug}|modifier-rules`, (signal) => invApi<{ rules: Rule[] }>(ctx.tenantSlug, 'modifier-rules', { signal }))
  const rule = rules.data?.rules.find((r) => norm(r.optionName) === norm(optionName) && r.groupName === null) ?? null

  if (rules.status === 'loading') {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title={`Opción «${optionName}»`}>
        <LoadingBlock rows={2} />
      </Panel>
    )
  }
  if (rules.status === 'error' && !rules.data) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title={`Opción «${optionName}»`}>
        <ErrorBlock error={rules.error} onRetry={rules.reload} what="la opción" />
      </Panel>
    )
  }
  return <Editor ctx={ctx} onClose={onClose} onChanged={onChanged} optionName={optionName} rule={rule} />
}

function Editor({ ctx, onClose, onChanged, optionName, rule }: Pick<PanelProps, 'ctx' | 'onClose' | 'onChanged'> & { optionName: string; rule: Rule | null }) {
  const [rows, setRows] = useState<DraftRow[]>(() =>
    rule && rule.isActive ? rule.items.map((i, n) => ({ key: `m${n}`, skuId: String(i.skuId), quantity: String(i.quantity).replace('.', ','), unit: i.unit })) : [],
  )
  const [extra, setExtra] = useState<SkuOption[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const skus = useMemo(() => new Map<string, DraftSku>([...ctx.skus, ...extra].map((s) => [s._id, s])), [ctx.skus, extra])
  const errors = validateRows(rows, skus, { allowNegative: true })

  async function createSku(input: NewSkuInput) {
    const res = await invApi<{ sku: SkuOption }>(ctx.tenantSlug, 'skus', { method: 'POST', body: { ...input, businessImpact: 'medium' } })
    if (!res.ok) {
      setServerError(res.error.message)
      return null
    }
    setExtra((x) => [...x, res.data.sku])
    ctx.refreshCatalog()
    return res.data.sku
  }

  async function save() {
    setShowErrors(true)
    if (Object.keys(errors).length) return
    // Sin filas = desactivar (la API exige al menos un ítem: se conserva la definición anterior).
    if (rows.length === 0 && !rule) {
      setServerError('Agregá al menos un insumo, o cerrá si esta opción no cambia el consumo.')
      return
    }
    setBusy(true)
    setServerError(null)
    const body = rows.length
      ? { optionName, items: rowsToItems(rows), isActive: true }
      : { optionName, items: rule!.items, isActive: false }
    const res = await invApi(ctx.tenantSlug, 'modifier-rules', { method: 'PUT', body })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setSaved(rows.length ? 'Guardado: cada vez que se elija esta opción se aplica este cambio de consumo.' : 'La opción quedó sin efecto en insumos.')
    onChanged()
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Opción «${optionName}»`}
      description="Qué agrega (positivo) o quita (negativo) por porción, en todos los platos donde se elija."
      wide
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={save} disabled={busy}>
            {busy ? <Spinner label="Guardando" /> : <Save size={18} aria-hidden />} Guardar
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice tone="error">{serverError}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}
        <RowsEditor rows={rows} onChange={setRows} skus={skus} errors={showErrors ? errors : {}} allowNegative onCreateSku={createSku} />
        <p className="text-sm text-muted-foreground">Ejemplo: «Extra queso» → Queso +30 g. «Sin cebolla» → Cebolla −20 g. Quitá todas las filas para que no tenga efecto.</p>
      </div>
    </Panel>
  )
}
