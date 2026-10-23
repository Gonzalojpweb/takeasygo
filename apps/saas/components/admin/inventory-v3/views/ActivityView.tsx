'use client'

// ============================================================================
// Actividad — qué pasó con el inventario, en lenguaje natural
// ============================================================================
// Es el ledger de la sede contado como historia: qué pasó, cuándo, quién y
// cuánto cambió. Lo mismo que usó el sistema para calcular el stock.
// ============================================================================

import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ClipboardCheck, History, RotateCcw, ShoppingBag, SlidersHorizontal, Trash2, Truck, Utensils } from 'lucide-react'
import { invApi } from '../data/api'
import type { ActivityData, ActivityEntry } from '../data/types'
import { UNIT_SHORT, dayLabel, formatDelta, formatQty, pesos } from '@/lib/inventory/ui/format'
import { EmptyBlock, ErrorBlock, FilterChip, LoadingBlock, Spinner, btnSecondary } from '../ui'
import type { V3Context } from '../InventoryV3'

type Filter = 'all' | 'sale' | 'receipt' | 'count' | 'waste' | 'other'

const FILTERS: Array<{ id: Filter; label: string; kinds: string }> = [
  { id: 'all', label: 'Todo', kinds: '' },
  { id: 'sale', label: 'Ventas', kinds: 'sale,sale_reverted' },
  { id: 'receipt', label: 'Recepciones', kinds: 'receipt' },
  { id: 'count', label: 'Conteos', kinds: 'count' },
  { id: 'waste', label: 'Mermas', kinds: 'waste' },
  { id: 'other', label: 'Ajustes y otros', kinds: 'adjustment,transfer_out,transfer_in,production' },
]

const ICON: Record<ActivityEntry['kind'], React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  sale: ShoppingBag,
  sale_reverted: RotateCcw,
  receipt: Truck,
  count: ClipboardCheck,
  waste: Trash2,
  adjustment: SlidersHorizontal,
  transfer_out: ArrowUpRight,
  transfer_in: ArrowDownLeft,
  production: Utensils,
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; entries: ActivityEntry[]; next: string | null; more: 'idle' | 'loading' | 'error' }

export default function ActivityView({ ctx }: { ctx: V3Context }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds

  useEffect(() => {
    const ctrl = new AbortController()
    invApi<ActivityData>(ctx.tenantSlug, `activity?locationId=${ctx.location.id}&limit=30${kinds ? `&kinds=${kinds}` : ''}`, { signal: ctrl.signal }).then((res) => {
      if (ctrl.signal.aborted) return
      setState(res.ok ? { status: 'ready', entries: res.data.entries, next: res.data.nextBefore, more: 'idle' } : { status: 'error', message: res.error.message })
    })
    return () => ctrl.abort()
  }, [ctx.tenantSlug, ctx.location.id, ctx.version, kinds, nonce])

  async function loadMore() {
    if (state.status !== 'ready' || !state.next) return
    setState({ ...state, more: 'loading' })
    const res = await invApi<ActivityData>(ctx.tenantSlug, `activity?locationId=${ctx.location.id}&limit=30&before=${encodeURIComponent(state.next)}${kinds ? `&kinds=${kinds}` : ''}`)
    setState((s) =>
      s.status !== 'ready' ? s : res.ok ? { status: 'ready', entries: [...s.entries, ...res.data.entries], next: res.data.nextBefore, more: 'idle' } : { ...s, more: 'error' },
    )
  }

  const groups: Array<{ day: string; entries: ActivityEntry[] }> = []
  if (state.status === 'ready') {
    for (const e of state.entries) {
      const day = dayLabel(e.occurredAt)
      const g = groups[groups.length - 1]
      if (g && g.day === day) g.entries.push(e)
      else groups.push({ day, entries: [e] })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cada entrada, salida, conteo y ajuste, con fecha, persona y motivo. Nada se borra.</p>
        <button type="button" className="min-h-11 text-sm font-bold text-primary underline-offset-2 hover:underline" onClick={() => ctx.help('actividad')}>
          ¿Cómo leer la actividad?
        </button>
      </div>
      <div role="group" aria-label="Filtrar actividad" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            active={filter === f.id}
            onClick={() => {
              setFilter(f.id)
              setState({ status: 'loading' })
            }}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      {state.status === 'loading' && <LoadingBlock label="Cargando actividad" rows={5} />}
      {state.status === 'error' && (
        <ErrorBlock
          error={{ message: state.message, code: null, status: 0, network: false }}
          onRetry={() => {
            setState({ status: 'loading' })
            setNonce((n) => n + 1)
          }}
          what="la actividad"
        />
      )}
      {state.status === 'ready' && state.entries.length === 0 && (
        <EmptyBlock icon={<History size={32} />} title="Sin movimientos todavía">
          Acá vas a ver cada venta que descontó insumos, las recepciones, los conteos y las mermas.
        </EmptyBlock>
      )}

      {state.status === 'ready' && groups.map((g) => (
        <section key={g.day} aria-label={g.day} className="space-y-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-muted-foreground">{g.day}</h2>
          <ol className="space-y-2">
            {g.entries.map((e) => (
              <Entry key={e.id} e={e} showMoney={ctx.caps.read} />
            ))}
          </ol>
        </section>
      ))}

      {state.status === 'ready' && state.next && (
        <div className="flex flex-col items-center gap-2">
          <button type="button" className={btnSecondary} onClick={loadMore} disabled={state.more === 'loading'}>
            {state.more === 'loading' && <Spinner label="Cargando más" />} Ver movimientos anteriores
          </button>
          {state.more === 'error' && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">No se pudieron cargar. Reintentá.</p>}
        </div>
      )}
    </div>
  )
}

function Entry({ e, showMoney }: { e: ActivityEntry; showMoney: boolean }) {
  const Icon = ICON[e.kind]
  const time = new Date(e.occurredAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return (
    <li className="flex gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="font-black">{e.title}</p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={e.occurredAt}>{time}</time> · {e.actor}
          </p>
        </div>
        {e.detail && <p className="text-sm text-muted-foreground">{e.detail}</p>}
        {e.lines.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {e.lines.map((l) => (
              <li key={l.skuId}>
                <span className="font-semibold">{l.skuName}</span>{' '}
                <span className="tabular-nums">{l.observed !== null ? `contado ${formatQty(l.observed, l.unit)}` : l.delta !== null ? formatDelta(l.delta, l.unit) : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {showMoney && e.unitCostCents ? (
          <p className="text-xs text-muted-foreground">
            Costo: {pesos(e.unitCostCents)}/{UNIT_SHORT[e.lines[0]?.unit ?? ''] ?? 'u.'}
          </p>
        ) : null}
        {e.warnings.length > 0 && <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{e.warnings[0]}</p>}
      </div>
    </li>
  )
}
