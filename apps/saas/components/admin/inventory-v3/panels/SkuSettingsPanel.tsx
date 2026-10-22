'use client'

// ============================================================================
// Configuración de un insumo (gestión)
// ============================================================================
// Nombre, categoría, stock mínimo (alerta de reposición), importancia para
// el negocio (cuánto pesa en "qué contar hoy"), proveedor y activo. La unidad
// solo se puede cambiar si el insumo no tiene movimientos (lo valida el
// servidor: es la unidad de todo su historial).
// ============================================================================

import { useState } from 'react'
import { Save } from 'lucide-react'
import { invApi } from '../data/api'
import { parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_LONG } from '@/lib/inventory/ui/format'
import { Field, LoadingBlock, Notice, Panel, Spinner, btnPrimary, btnSecondary, inputClass } from '../ui'
import type { PanelProps } from './PanelHost'

const CATEGORIES: Array<[string, string]> = [
  ['meat_poultry', 'Carnes y aves'],
  ['fish_seafood', 'Pescados y mariscos'],
  ['vegetables', 'Verduras'],
  ['fruits', 'Frutas'],
  ['dairy', 'Lácteos'],
  ['dry_goods', 'Almacén'],
  ['beverages', 'Bebidas'],
  ['packaging', 'Descartables'],
  ['other', 'Otros'],
]

const IMPACT: Array<[string, string]> = [
  ['critical', 'Crítico: sin esto no se trabaja'],
  ['high', 'Alto'],
  ['medium', 'Medio'],
  ['low', 'Bajo'],
]

export default function SkuSettingsPanel({ ctx, onClose, onChanged, skuId }: PanelProps & { skuId: string }) {
  const sku = ctx.allSkus.find((s) => s._id === skuId)
  const [form, setForm] = useState(() => ({
    name: sku?.name ?? '',
    category: sku?.category ?? 'other',
    canonicalUnit: sku?.canonicalUnit ?? 'kg',
    businessImpact: sku?.businessImpact ?? 'medium',
    parLevel: sku?.parLevel !== null && sku?.parLevel !== undefined ? String(sku.parLevel).replace('.', ',') : '',
    supplierName: sku?.supplierName ?? '',
  }))
  const [errors, setErrors] = useState<{ name?: string; parLevel?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!sku) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Insumo">
        {ctx.catalogReady ? <Notice tone="error">Este insumo no existe.</Notice> : <LoadingBlock rows={2} />}
      </Panel>
    )
  }

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true)
    setServerError(null)
    setSaved(null)
    const res = await invApi(ctx.tenantSlug, `skus/${skuId}`, { method: 'PATCH', body })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setSaved(message)
    onChanged()
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (form.name.trim().length < 2) next.name = 'El nombre tiene que tener al menos 2 letras'
    const par = form.parLevel.trim() ? parseDecimal(form.parLevel) : null
    if (form.parLevel.trim() && (par === null || par < 0)) next.parLevel = 'Cantidad inválida'
    setErrors(next)
    if (Object.keys(next).length) return
    patch(
      {
        name: form.name.trim(),
        category: form.category,
        businessImpact: form.businessImpact,
        parLevel: par,
        supplierName: form.supplierName.trim() || null,
        ...(form.canonicalUnit !== sku!.canonicalUnit ? { canonicalUnit: form.canonicalUnit } : {}),
      },
      'Cambios guardados.',
    )
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Configurar ${sku.name}`}
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="submit" form="sku-form" className={btnPrimary} disabled={busy}>
            {busy ? <Spinner label="Guardando" /> : <Save size={18} aria-hidden />} Guardar
          </button>
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => patch({ isActive: !sku.isActive }, sku.isActive ? 'Insumo desactivado: ya no aparece para cargar.' : 'Insumo reactivado.')}>
            {sku.isActive ? 'Desactivar' : 'Reactivar'}
          </button>
        </div>
      }
    >
      <form id="sku-form" onSubmit={save} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}
        {!sku.isActive && <Notice tone="info">Este insumo está desactivado.</Notice>}
        <Field label="Nombre" error={errors.name}>
          {(a11y) => <input {...a11y} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            {(a11y) => (
              <select {...a11y} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {CATEGORIES.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Se mide en" hint="Solo se puede cambiar si todavía no tiene movimientos.">
            {(a11y) => (
              <select {...a11y} value={form.canonicalUnit} onChange={(e) => setForm({ ...form, canonicalUnit: e.target.value })} className={inputClass}>
                {(['kg', 'g', 'l', 'ml', 'unit'] as const).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LONG[u]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={`Stock mínimo (${UNIT_LONG[sku.canonicalUnit] ?? sku.canonicalUnit})`} error={errors.parLevel} hint="Por debajo de esto te avisamos para reponer.">
            {(a11y) => <input {...a11y} inputMode="decimal" value={form.parLevel} onChange={(e) => setForm({ ...form, parLevel: e.target.value })} className={inputClass} placeholder="Sin mínimo" />}
          </Field>
          <Field label="Importancia" hint="Lo crítico se pide contar antes.">
            {(a11y) => (
              <select {...a11y} value={form.businessImpact} onChange={(e) => setForm({ ...form, businessImpact: e.target.value })} className={inputClass}>
                {IMPACT.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Proveedor habitual (opcional)">
          {(a11y) => <input {...a11y} value={form.supplierName} maxLength={120} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} className={inputClass} />}
        </Field>
      </form>
    </Panel>
  )
}
