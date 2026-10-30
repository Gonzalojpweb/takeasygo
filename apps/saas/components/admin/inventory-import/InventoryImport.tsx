'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet, History, RotateCcw, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORY_LABEL, UNIT_LABEL } from '@/components/admin/inventory/shared'
import { FilterChip, Notice, Spinner, StatusTag, btnGhost, btnPrimary, btnSecondary, inputClass } from '@/components/admin/inventory-v3/ui'
import { invApi, type ApiError } from '@/components/admin/inventory-v3/data/api'
import type { InventoryPageLocation } from '@/lib/inventory/page-context'
import type { ImportRow, MappedSheet } from '@/lib/inventory/import/mapping'
import type { CommitResult, UndoResult } from '@/lib/inventory/import/commit'

// ============================================================================
// Importar inventario desde otro sistema (v1, 30/10/2026)
// ============================================================================
// 1 · Subir el export (Fudo › Stock, Maxirest, Bistrosoft, Núcleo, planilla).
// 2 · Revisar: cada fila con su diagnóstico; todo se puede corregir acá
//     (nombre, categoría, unidad, stock, mínimo, costo) o dejar afuera.
// 3 · Confirmar: se crean los insumos y el stock queda como conteo de
//     apertura. La sede sin inventario queda EN PREPARACIÓN (no descuenta).
// Historial con «Deshacer» por importación.
// ============================================================================

const CATEGORIES = Object.keys(CATEGORY_LABEL)
const UNITS = ['kg', 'g', 'l', 'ml', 'unit'] as const
type Filter = 'all' | 'ok' | 'warn' | 'out'

interface Preview {
  fileName: string
  sheets: MappedSheet[]
}

interface HistoryItem {
  id: string
  source: string
  fileName: string
  counts: { created: number; matched: number; stockLoaded: number; skipped: number }
  status: 'done' | 'undone'
  createdAt: string
}

const SOURCE_LABEL: Record<string, string> = { fudo: 'Fudo', generic: 'Planilla' }

function money(cents: number | null): string {
  return cents === null ? '' : String(cents / 100)
}

export default function InventoryImport({ tenantSlug, locations, backHref }: { tenantSlug: string; locations: InventoryPageLocation[]; backHref: string }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<null | 'reading' | 'saving'>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [undoAsk, setUndoAsk] = useState<string | null>(null)
  const [undoMsg, setUndoMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const location = locations.find((l) => l.id === locationId)

  const loadHistory = useCallback(async () => {
    if (!locationId) return
    const res = await invApi<{ imports: HistoryItem[] }>(tenantSlug, `import?locationId=${encodeURIComponent(locationId)}`)
    setHistory(res.ok ? res.data.imports : [])
  }, [tenantSlug, locationId])

  useEffect(() => { void loadHistory() }, [loadHistory])

  async function readFile(file: File) {
    setError(null)
    setResult(null)
    setBusy('reading')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/${tenantSlug}/inventory/import/preview`, { method: 'POST', body: form, cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'No se pudo leer el archivo')
        return
      }
      const p = data as Preview
      setPreview(p)
      setRows(p.sheets.flatMap((s) => s.rows))
      setFilter('all')
    } catch {
      setError('Sin conexión: no se pudo subir el archivo')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const edit = (id: string, patch: Partial<ImportRow>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const included = rows.filter((r) => r.include && r.name.trim().length >= 2)
  const withStock = included.filter((r) => r.quantity !== null).length
  const counts = useMemo(() => ({
    all: rows.length,
    ok: rows.filter((r) => r.include && r.status === 'ok').length,
    warn: rows.filter((r) => r.include && r.status === 'warn').length,
    out: rows.filter((r) => !r.include).length,
  }), [rows])

  const visible = (sheet: string) => rows.filter((r) => r.sheet === sheet && (
    filter === 'all' || (filter === 'out' ? !r.include : r.include && r.status === filter)
  ))

  async function confirm() {
    if (!preview || included.length === 0) return
    setBusy('saving')
    setError(null)
    const source = preview.sheets.some((s) => s.source === 'fudo') ? 'fudo' : 'generic'
    const res = await invApi<CommitResult>(tenantSlug, 'import', {
      method: 'POST',
      body: {
        locationId,
        fileName: preview.fileName,
        source,
        skipped: rows.length - included.length,
        rows: included.map((r) => ({
          name: r.name.trim(), category: r.category, unit: r.unit, quantity: r.quantity,
          parLevel: r.parLevel, costCents: r.costCents, supplier: r.supplier, code: r.code,
        })),
      },
    })
    setBusy(null)
    if (!res.ok) { setError(res.error.message); return }
    setResult(res.data)
    setPreview(null)
    setRows([])
    void loadHistory()
  }

  async function undo(id: string) {
    setUndoAsk(null)
    const res = await invApi<UndoResult>(tenantSlug, `import/${id}/undo`, { method: 'POST' })
    if (!res.ok) { setUndoMsg({ tone: 'error', text: (res.error as ApiError).message }); return }
    const kept = res.data.kept.length
    setUndoMsg({
      tone: 'success',
      text: `Listo: se quitaron ${res.data.deactivated} insumos.${kept ? ` ${kept} quedaron porque ya se usan (recetas o movimientos).` : ''}`,
    })
    if (result?.importId === id) setResult(null)
    void loadHistory()
  }

  return (
    <div className="space-y-6 pb-28">
      <header className="space-y-2">
        <Link href={backHref} className={cn(btnGhost, '-ml-3')}>
          <ArrowLeft size={18} aria-hidden /> Inventario
        </Link>
        <h1 className="text-3xl font-black tracking-tight text-balance sm:text-4xl">Importar desde otro sistema</h1>
        <p className="max-w-2xl text-sm font-medium text-muted-foreground">
          Traé tus insumos y su stock desde Fudo, Maxirest, Bistrosoft, Núcleo o una planilla propia. Revisás todo antes de guardar y podés deshacerlo.
        </p>
      </header>

      {result && (
        <Notice tone="success">
          <p className="font-bold">Importación lista</p>
          <p>
            {result.created} insumos nuevos · {result.matched} ya existían · stock cargado en {result.stockLoaded}
            {result.skipped ? ` · ${result.skipped} quedaron afuera` : ''}.
            {result.preparedLocation && ` La sede ${location?.name ?? ''} quedó en preparación: las ventas todavía no descuentan. Cargá las recetas y activala desde Inventario.`}
          </p>
          {result.problems.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.problems.map((p) => <li key={p.name}><b>{p.name}:</b> {p.message}</li>)}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={backHref} className={btnPrimary}>Ir a Inventario</Link>
            <button type="button" className={btnSecondary} onClick={() => setUndoAsk(result.importId)}>
              <RotateCcw size={16} aria-hidden /> Deshacer esta importación
            </button>
          </div>
        </Notice>
      )}

      {!preview && (
        <section aria-labelledby="imp-step1" className="space-y-4 rounded-2xl border-2 border-border bg-card p-5">
          <h2 id="imp-step1" className="text-lg font-black">1 · Elegí la sede y subí el archivo</h2>
          {locations.length > 1 && (
            <label className="flex flex-col gap-1 text-sm font-bold sm:max-w-xs">
              Sede
              <select id="imp-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.status === 'active' ? '' : l.status === 'preparing' ? ' (en preparación)' : ' (sin inventario)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label
            htmlFor="imp-file"
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void readFile(f)
            }}
            className={cn(
              'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
            )}
          >
            {busy === 'reading' ? <Spinner label="Leyendo el archivo" /> : <Upload size={28} aria-hidden className="text-muted-foreground" />}
            <span className="text-base font-bold">{busy === 'reading' ? 'Leyendo el archivo…' : 'Arrastrá el archivo o tocá para elegirlo'}</span>
            <span className="text-sm text-muted-foreground">Excel (.xlsx) o CSV · hasta 2 MB y 1000 filas</span>
            <input
              id="imp-file"
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f) }}
            />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <details className="rounded-xl bg-muted/50 p-3 text-sm">
            <summary className="cursor-pointer font-bold">¿Cómo exporto mi inventario?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li><b className="text-foreground">Fudo:</b> Stock › Exportar. Sirve el Excel tal cual (hojas «Ingredientes» y «Productos»). El reporte de ventas no es stock.</li>
              <li><b className="text-foreground">Maxirest, Bistrosoft, Núcleo u otro:</b> buscá el listado o reporte de stock de insumos y exportalo a Excel o CSV. Reconocemos columnas como Descripción, Rubro, UM, Existencia, Stock mínimo, Costo y Proveedor.</li>
              <li><b className="text-foreground">.xls viejo:</b> abrilo en Excel y guardalo como .xlsx.</li>
            </ul>
          </details>
        </section>
      )}

      {preview && (
        <section aria-labelledby="imp-step2" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="imp-step2" className="text-lg font-black">2 · Revisá antes de importar</h2>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileSpreadsheet size={16} aria-hidden /> {preview.fileName} · sede {location?.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar filas">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todas ({counts.all})</FilterChip>
              <FilterChip active={filter === 'ok'} onClick={() => setFilter('ok')}>Listas ({counts.ok})</FilterChip>
              <FilterChip active={filter === 'warn'} onClick={() => setFilter('warn')}>Revisar ({counts.warn})</FilterChip>
              <FilterChip active={filter === 'out'} onClick={() => setFilter('out')}>Afuera ({counts.out})</FilterChip>
            </div>
          </div>

          {preview.sheets.map((sheet) => {
            const list = visible(sheet.name)
            return (
              <div key={sheet.name} className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-black">Hoja «{sheet.name}»</h3>
                  {sheet.source === 'fudo' && <StatusTag tone="ok">Fudo reconocido</StatusTag>}
                  {sheet.kind === 'sales' && <StatusTag tone="warning">Reporte de ventas</StatusTag>}
                </div>
                {sheet.notice && <p className="text-sm text-muted-foreground">{sheet.notice}</p>}
                {list.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">Nada para mostrar con este filtro.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] border-separate border-spacing-y-1 text-sm">
                      <thead className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="w-10 px-2 py-1"><span className="sr-only">Importar</span></th>
                          <th className="px-2 py-1">Insumo</th>
                          <th className="px-2 py-1">Categoría</th>
                          <th className="px-2 py-1">Unidad</th>
                          <th className="px-2 py-1">Stock</th>
                          <th className="px-2 py-1">Mínimo</th>
                          <th className="px-2 py-1">Costo $</th>
                          <th className="px-2 py-1">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <ImportRowView key={r.id} row={r} onEdit={(patch) => edit(r.id, patch)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {error && <Notice tone="error">{error}</Notice>}

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-border bg-background/95 px-4 py-3 backdrop-blur">
            <p className="text-sm font-medium">
              <b>{included.length}</b> insumos para importar · <b>{withStock}</b> con stock
              {location?.status === 'off' && <span className="text-muted-foreground"> · la sede quedará en preparación</span>}
            </p>
            <div className="flex gap-2">
              <button type="button" className={btnSecondary} onClick={() => { setPreview(null); setRows([]) }} disabled={busy !== null}>
                Elegir otro archivo
              </button>
              <button type="button" className={btnPrimary} onClick={() => { void confirm() }} disabled={busy !== null || included.length === 0}>
                {busy === 'saving' ? <Spinner label="Importando" /> : null} Importar {included.length} insumos
              </button>
            </div>
          </div>
        </section>
      )}

      {undoAsk && (
        <Notice tone="info">
          <p className="font-bold">¿Deshacer la importación?</p>
          <p>Se quitan los insumos que creó, salvo los que ya se usen en recetas o movimientos. Los conteos quedan en el historial.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnPrimary} onClick={() => { void undo(undoAsk) }}>Sí, deshacer</button>
            <button type="button" className={btnSecondary} onClick={() => setUndoAsk(null)}>No</button>
          </div>
        </Notice>
      )}
      {undoMsg && <Notice tone={undoMsg.tone}>{undoMsg.text}</Notice>}

      <section aria-labelledby="imp-history" className="space-y-3">
        <h2 id="imp-history" className="flex items-center gap-2 text-lg font-black">
          <History size={18} aria-hidden /> Importaciones de {location?.name ?? 'la sede'}
        </h2>
        {history === null ? (
          <Spinner label="Cargando historial" />
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se importó nada en esta sede.</p>
        ) : (
          <ul className="divide-y-2 divide-border rounded-2xl border-2 border-border bg-card">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-bold">{h.fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    {SOURCE_LABEL[h.source] ?? h.source} · {new Date(h.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {h.counts.created} nuevos · {h.counts.matched} existentes · {h.counts.stockLoaded} con stock
                  </p>
                </div>
                {h.status === 'undone' ? (
                  <StatusTag tone="neutral">Deshecha</StatusTag>
                ) : (
                  <button type="button" className={btnSecondary} onClick={() => setUndoAsk(h.id)}>
                    <RotateCcw size={16} aria-hidden /> Deshacer
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ImportRowView({ row: r, onEdit }: { row: ImportRow; onEdit: (patch: Partial<ImportRow>) => void }) {
  const cell = 'bg-muted/40 px-2 py-1.5 first:rounded-l-xl last:rounded-r-xl align-top'
  const small = 'block min-h-10 w-full rounded-lg border-2 border-border bg-background px-2 text-sm focus-visible:border-primary focus-visible:outline-none'
  const tone = !r.include ? 'neutral' : r.status === 'warn' ? 'warning' : r.status === 'error' ? 'danger' : 'ok'
  const label = !r.include ? (r.status === 'error' ? 'Error' : 'Afuera') : r.status === 'warn' ? 'Revisar' : 'Lista'
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v.replace(',', '.')) || 0))
  return (
    <tr className={cn(!r.include && 'opacity-60')}>
      <td className={cell}>
        <input
          type="checkbox"
          className="mt-2.5 size-5 accent-primary"
          checked={r.include}
          disabled={r.status === 'error' && !r.name}
          onChange={(e) => onEdit({ include: e.target.checked })}
          aria-label={`Importar ${r.name || `fila ${r.line}`}`}
        />
      </td>
      <td className={cell}>
        <input className={small} value={r.name} onChange={(e) => onEdit({ name: e.target.value })} aria-label={`Nombre (fila ${r.line})`} />
        <span className="mt-1 block text-xs text-muted-foreground">
          Fila {r.line}{r.sourceCategory ? ` · ${r.sourceCategory}` : ''}{r.match ? ' · ya existe: se usa ese insumo' : ''}
        </span>
      </td>
      <td className={cell}>
        <select className={small} value={r.category} onChange={(e) => onEdit({ category: e.target.value as ImportRow['category'] })} aria-label={`Categoría de ${r.name}`} disabled={!!r.match}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </td>
      <td className={cell}>
        <select className={small} value={r.unit} onChange={(e) => onEdit({ unit: e.target.value as ImportRow['unit'] })} aria-label={`Unidad de ${r.name}`}>
          {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
        </select>
      </td>
      <td className={cell}>
        <input className={cn(small, 'w-24 tabular-nums')} inputMode="decimal" value={r.quantity ?? ''} placeholder="—" onChange={(e) => onEdit({ quantity: num(e.target.value) })} aria-label={`Stock de ${r.name}`} />
      </td>
      <td className={cell}>
        <input className={cn(small, 'w-20 tabular-nums')} inputMode="decimal" value={r.parLevel ?? ''} placeholder="—" onChange={(e) => onEdit({ parLevel: num(e.target.value) })} aria-label={`Mínimo de ${r.name}`} />
      </td>
      <td className={cell}>
        <input className={cn(small, 'w-24 tabular-nums')} inputMode="decimal" value={money(r.costCents)} placeholder="—" onChange={(e) => { const v = num(e.target.value); onEdit({ costCents: v === null ? null : Math.round(v * 100) }) }} aria-label={`Costo de ${r.name}`} disabled={!!r.match} />
      </td>
      <td className={cn(cell, 'min-w-56')}>
        <StatusTag tone={tone}>{label}</StatusTag>
        {r.messages.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{r.messages.map((m) => <li key={m}>{m}</li>)}</ul>}
      </td>
    </tr>
  )
}
