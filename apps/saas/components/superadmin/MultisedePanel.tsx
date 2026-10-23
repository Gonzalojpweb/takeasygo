'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Eye,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const FLAG_KEYS = [
  'multisede.strictLocationId',
  'rbac.sedeScope',
  'config.layers',
  'numbering.perLocation',
  'mp.perLocation',
  'inventory.v3',
] as const

const FLAG_LABELS: Record<string, string> = {
  'multisede.strictLocationId': 'Aislamiento estricto',
  'rbac.sedeScope': 'Roles por sede',
  'config.layers': 'Config 3 capas',
  'numbering.perLocation': 'Numeración por sede',
  'mp.perLocation': 'MP por sede',
  'inventory.v3': 'Inventario V3',
}

const MODE_FLAGS = new Set<string>(['multisede.strictLocationId', 'rbac.sedeScope'])

interface Check {
  id: string
  level: 'ok' | 'warn' | 'blocker' | 'info'
  msg: string
}

interface Verdict {
  state: 'LISTA' | 'BLOCKED' | 'YA ENCENDIDA'
  detail: string
}

interface TenantRow {
  slug: string
  name: string
  plan: string
  flags: Record<string, unknown>
  checks: Check[]
  verdicts: Record<string, Verdict>
  metrics: {
    locations: { total: number; activas: number; sinPrefijo: string[]; sinCuentaMp: string[] }
    ulr: { total: number; activas: number; usuariosActivos: number }
    mp: { sharedOk: boolean; cuentas: number; pendingSinAccount: number }
    cash: { total: number; sinSede: number }
    shadowRecientes: number
  }
  lastChange: {
    userName: string
    createdAt: string
    detail: string
    prevFlags: Record<string, unknown> | null
    newFlags: Record<string, unknown> | null
  } | null
}

interface ShadowData {
  tenant: { slug: string; name: string }
  dias: number
  rbacMode: string
  summary: { total: number; usuariosDistintos: number; nota: string }
  byUser: { total: number; items: Array<{ userName: string; role: string; count: number; pct: number }> }
  byRoute: { total: number; items: Array<{ label: string; count: number; pct: number }> }
  bySede: { total: number; items: Array<{ label: string; count: number; pct: number }> }
  byPermission: { total: number; items: Array<{ label: string; count: number; pct: number }> }
  byEffectiveRole: { total: number; items: Array<{ label: string; count: number; pct: number }> }
}

function modeOf(raw: unknown): 'off' | 'log' | 'enforce' {
  if (typeof raw === 'boolean') return raw ? 'enforce' : 'off'
  const n = String(raw ?? '').trim().toLowerCase()
  if (['enforce', 'true', 'on', '1'].includes(n)) return 'enforce'
  if (n === 'log') return 'log'
  return 'off'
}

function boolOf(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1
  return ['true', '1', 'on', 'yes'].includes(String(raw ?? '').trim().toLowerCase())
}

function verdictBadge(v: Verdict | undefined) {
  if (!v) return <Badge variant="secondary">—</Badge>
  if (v.state === 'LISTA') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Lista</Badge>
  if (v.state === 'BLOCKED') return <Badge className="bg-red-100 text-red-700 border-red-200">Bloqueada</Badge>
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Encendida</Badge>
}

function flagValueBadge(raw: unknown) {
  const n = String(raw ?? '').toLowerCase()
  if (raw === undefined || raw === null || n === '' || n === 'off' || n === 'false' || n === '0') {
    return <Badge variant="secondary" className="text-[10px]">off</Badge>
  }
  if (n === 'log') return <Badge className="bg-sky-100 text-sky-700 border-sky-200 text-[10px]">log</Badge>
  if (n === 'enforce' || n === 'true' || n === '1' || n === 'on') {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">ON</Badge>
  }
  return <Badge variant="secondary" className="text-[10px]">{n}</Badge>
}

const CHECK_ICONS: Record<Check['level'], React.ElementType> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  blocker: CircleAlert,
  info: Info,
}

const CHECK_CLASSES: Record<Check['level'], string> = {
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  blocker: 'text-red-600',
  info: 'text-sky-600',
}

export default function MultisedePanel() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(7)
  const [generatedAt, setGeneratedAt] = useState('')
  const [error, setError] = useState('')

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [confirmText, setConfirmText] = useState('')
  const [applying, setApplying] = useState(false)

  const [shadowTenant, setShadowTenant] = useState('')
  const [shadowDias, setShadowDias] = useState(7)
  const [shadow, setShadow] = useState<ShadowData | null>(null)
  const [shadowLoading, setShadowLoading] = useState(false)

  const selected = useMemo(() => tenants.find(t => t.slug === selectedSlug) ?? null, [tenants, selectedSlug])

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/superadmin/multisede/overview?dias=${d}`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      const data = await res.json()
      setTenants(data.tenants ?? [])
      setGeneratedAt(data.generatedAt ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(dias)
  }, [load, dias])

  const openTenant = (t: TenantRow) => {
    setSelectedSlug(t.slug)
    setDraft({ ...t.flags })
    setConfirmText('')
  }

  const pendingChanges = useMemo(() => {
    if (!selected) return []
    return FLAG_KEYS.flatMap(key => {
      const prev = selected.flags[key]
      const next = draft[key]
      const equal = MODE_FLAGS.has(key)
        ? modeOf(prev) === modeOf(next)
        : boolOf(prev) === boolOf(next)
      return equal ? [] : [{ key, prev, next }]
    })
  }, [selected, draft])

  const apply = async (action: 'set' | 'rollback', rollbackTo?: Record<string, unknown>) => {
    if (!selected) return
    setApplying(true)
    try {
      const res = await fetch('/api/superadmin/multisede/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'rollback'
            ? { action: 'rollback', tenantSlug: selected.slug, confirmSlug: confirmText, rollbackTo }
            : { tenantSlug: selected.slug, confirmSlug: confirmText, changes: pendingChanges.map(c => ({ key: c.key, next: c.next })) }
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'No se pudo aplicar el cambio')
        return
      }
      toast.success(
        action === 'rollback'
          ? `Estado anterior restaurado en ${selected.name}`
          : data.changed === 0
            ? 'Sin cambios: ya tenían ese valor'
            : `Flags actualizadas en ${selected.name} (${data.changed})`
      )
      setSelectedSlug(null)
      setConfirmText('')
      await load(dias)
    } finally {
      setApplying(false)
    }
  }

  const runShadow = async () => {
    if (!shadowTenant) return
    setShadowLoading(true)
    setShadow(null)
    try {
      const res = await fetch(`/api/superadmin/multisede/shadow?tenant=${encodeURIComponent(shadowTenant)}&dias=${shadowDias}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setShadow(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el reporte de sombra')
    } finally {
      setShadowLoading(false)
    }
  }

  const stats = useMemo(() => {
    let lista = 0
    let bloqueadas = 0
    let encendidas = 0
    for (const t of tenants) {
      for (const key of FLAG_KEYS) {
        const s = t.verdicts[key]?.state
        if (s === 'LISTA') lista++
        else if (s === 'BLOCKED') bloqueadas++
        else if (s === 'YA ENCENDIDA') encendidas++
      }
    }
    return { lista, bloqueadas, encendidas }
  }, [tenants])

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Negocios</p>
          <p className="text-3xl font-bold mt-1">{tenants.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Llaves listas</p>
          <p className="text-3xl font-bold mt-1 text-emerald-600">{stats.lista}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bloqueadas</p>
          <p className="text-3xl font-bold mt-1 text-red-600">{stats.bloqueadas}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Encendidas</p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{stats.encendidas}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="dias" className="text-xs text-muted-foreground">Ventana (días)</Label>
          <Input
            id="dias"
            type="number"
            min={1}
            max={90}
            value={dias}
            onChange={e => setDias(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
            className="w-20 h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => load(dias)} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Actualizar
        </Button>
        {generatedAt && (
          <span className="text-xs text-muted-foreground">
            Último cálculo: {new Date(generatedAt).toLocaleString('es-AR')}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabla por negocio */}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Negocio</th>
              <th className="px-2 py-3 font-semibold">Sedes</th>
              <th className="px-2 py-3 font-semibold">Roles/sede</th>
              <th className="px-2 py-3 font-semibold">MP</th>
              <th className="px-2 py-3 font-semibold">Caja</th>
              <th className="px-4 py-3 font-semibold">Llaves</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {loading && tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 size={16} className="animate-spin inline mr-2" />
                  Calculando condiciones multisede…
                </td>
              </tr>
            )}
            {!loading && tenants.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Sin negocios activos.
                </td>
              </tr>
            )}
            {tenants.map(t => {
              const prefijosOk = t.metrics.locations.activas > 0 && t.metrics.locations.sinPrefijo.length === 0
              const mpOk = t.metrics.mp.sharedOk && t.metrics.locations.sinCuentaMp.length === 0 && t.metrics.mp.pendingSinAccount === 0
              const cajaOk = t.metrics.cash.sinSede === 0
              return (
                <tr key={t.slug} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.slug}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className={cn('text-xs font-medium', prefijosOk ? 'text-emerald-600' : 'text-red-600')}>
                      {t.metrics.locations.activas - t.metrics.locations.sinPrefijo.length}/{t.metrics.locations.activas} prefijo
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <span className={cn('text-xs font-medium', t.metrics.ulr.usuariosActivos > 0 ? 'text-emerald-600' : 'text-amber-600')}>
                      {t.metrics.ulr.usuariosActivos} usuario(s)
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <span className={cn('text-xs font-medium', mpOk ? 'text-emerald-600' : 'text-red-600')}>
                      {mpOk ? 'lista' : 'pendiente'}
                      {t.metrics.mp.pendingSinAccount > 0 && ` (${t.metrics.mp.pendingSinAccount} pagos)`}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <span className={cn('text-xs font-medium', cajaOk ? 'text-emerald-600' : 'text-red-600')}>
                      {cajaOk ? 'hecho' : `${t.metrics.cash.sinSede} sin sede`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {FLAG_KEYS.map(key => (
                        <span key={key} title={`${FLAG_LABELS[key]}: ${t.verdicts[key]?.state ?? ''}`} className="inline-flex items-center gap-1">
                          {flagValueBadge(t.flags[key])}
                        </span>
                      ))}
                      <span className="ml-1">{verdictBadge(Object.values(t.verdicts).find(v => v.state === 'BLOCKED') ? { state: 'BLOCKED', detail: '' } : undefined)}</span>
                    </div>
                    {t.lastChange && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Último cambio: {t.lastChange.detail || '—'} ({t.lastChange.userName}, {new Date(t.lastChange.createdAt).toLocaleDateString('es-AR')})
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => openTenant(t)}>
                      <Zap size={14} />
                      Revisar
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Detalle del negocio */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelectedSlug(null); setConfirmText('') } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overscroll-contain">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-primary" />
                  {selected.name}
                  <span className="text-sm font-normal text-muted-foreground">({selected.slug})</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* Condiciones */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Condiciones antes de encender
                  </h3>
                  <ul className="space-y-1.5">
                    {selected.checks.map(c => {
                      const Icon = CHECK_ICONS[c.level]
                      return (
                        <li key={c.id} className="flex items-start gap-2 text-sm">
                          <Icon size={15} className={cn('mt-0.5 shrink-0', CHECK_CLASSES[c.level])} />
                          <span>
                            <span className="font-mono text-xs text-muted-foreground mr-1">[{c.id}]</span>
                            {c.msg}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </section>

                {/* Veredictos */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Estado de cada llave
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FLAG_KEYS.map(key => (
                      <div key={key} className="rounded-lg border p-2.5 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{FLAG_LABELS[key]}</p>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {selected.verdicts[key]?.detail}
                          </p>
                        </div>
                        {verdictBadge(selected.verdicts[key])}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Edición */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Cambiar llaves
                  </h3>
                  <div className="space-y-2">
                    {FLAG_KEYS.map(key => {
                      const isMode = MODE_FLAGS.has(key)
                      if (isMode) {
                        const modeValue = modeOf(draft[key])
                        return (
                          <div key={key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                            <span className="text-sm font-medium">{FLAG_LABELS[key]}</span>
                            <select
                              value={modeValue}
                              onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                              className="text-sm border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="off">off</option>
                              <option value="log">log (observar)</option>
                              <option value="enforce">enforce (bloquear)</option>
                            </select>
                          </div>
                        )
                      }
                      const boolValue = boolOf(draft[key])
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                          <span className="text-sm font-medium">{FLAG_LABELS[key]}</span>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={boolValue}
                              onChange={e => setDraft(d => ({ ...d, [key]: e.target.checked }))}
                              className="h-4 w-4 accent-primary"
                            />
                            {boolValue ? 'encendida' : 'apagada'}
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {/* Cambios pendientes + confirmación */}
                {pendingChanges.length > 0 && (
                  <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3">
                    <p className="text-sm font-semibold text-amber-800">
                      {pendingChanges.length} cambio(s) pendiente(s):
                    </p>
                    <ul className="text-sm text-amber-900 space-y-0.5">
                      {pendingChanges.map(c => (
                        <li key={String(c.key)}>
                          {FLAG_LABELS[c.key]}:{' '}
                          {MODE_FLAGS.has(c.key) ? modeOf(c.prev) : boolOf(c.prev) ? 'encendida' : 'apagada'}
                          {' → '}
                          <strong>{MODE_FLAGS.has(c.key) ? modeOf(c.next) : boolOf(c.next) ? 'encendida' : 'apagada'}</strong>
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm" className="text-xs text-amber-900">
                        Escribí el slug del negocio para confirmar ({selected.slug})
                      </Label>
                      <Input
                        id="confirm"
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        placeholder={selected.slug}
                        className="bg-white"
                        autoComplete="off"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => apply('set')}
                      disabled={applying || confirmText !== selected.slug}
                    >
                      {applying && <Loader2 size={14} className="animate-spin" />}
                      Aplicar cambios (con respaldo en bitácora)
                    </Button>
                  </section>
                )}

                {/* Volver atrás */}
                {selected.lastChange?.prevFlags && (
                  <section className="rounded-xl border p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <RotateCcw size={14} />
                      Último cambio: {selected.lastChange.detail || '—'}
                      <span className="text-xs text-muted-foreground">
                        por {selected.lastChange.userName} el {new Date(selected.lastChange.createdAt).toLocaleString('es-AR')}
                      </span>
                    </p>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="confirm-back" className="text-xs">
                          Escribí el slug para restaurar el estado previo ({selected.slug})
                        </Label>
                        <Input
                          id="confirm-back"
                          value={confirmText}
                          onChange={e => setConfirmText(e.target.value)}
                          placeholder={selected.slug}
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => apply('rollback', selected.lastChange!.prevFlags!)}
                        disabled={applying || confirmText !== selected.slug}
                      >
                        {applying && <Loader2 size={14} className="animate-spin" />}
                        Volver atrás
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modo observar */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Eye size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Modo observar — rbac.sedeScope en log</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Denegaciones simuladas (no bloquean) registradas por la sombra de RBAC. Usalo antes de pasar de <code>log</code> a <code>enforce</code>.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Negocio</Label>
            <select
              value={shadowTenant}
              onChange={e => setShadowTenant(e.target.value)}
              className="text-sm border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-52"
            >
              <option value="">Seleccioná un negocio…</option>
              {tenants.map(t => (
                <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ventana (días)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={shadowDias}
              onChange={e => setShadowDias(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
              className="w-24 h-9"
            />
          </div>
          <Button size="sm" onClick={runShadow} disabled={shadowLoading || !shadowTenant}>
            {shadowLoading && <Loader2 size={14} className="animate-spin" />}
            Generar reporte
          </Button>
        </div>

        {shadow && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline">rbac.sedeScope: {shadow.rbacMode}</Badge>
              <Badge variant="outline">{shadow.summary.total} denegación(es)</Badge>
              <Badge variant="outline">{shadow.summary.usuariosDistintos} usuario(s)</Badge>
            </div>
            <p className={cn('text-sm', shadow.summary.total === 0 ? 'text-emerald-600' : 'text-amber-700')}>
              {shadow.summary.nota}
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <ShadowTable title="Por usuario" rows={shadow.byUser.items.map(i => ({ label: `${i.userName} (${i.role})`, count: i.count, pct: i.pct }))} total={shadow.byUser.total} />
              <ShadowTable title="Por ruta" rows={shadow.byRoute.items} total={shadow.byRoute.total} />
              <ShadowTable title="Por sede" rows={shadow.bySede.items} total={shadow.bySede.total} />
              <ShadowTable title="Por permiso" rows={shadow.byPermission.items} total={shadow.byPermission.total} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function ShadowTable({ title, rows, total }: { title: string; rows: Array<{ label: string; count: number; pct: number }>; total: number }) {
  return (
    <div className="rounded-lg border p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos en la ventana.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(r => (
            <li key={r.label} className="flex items-center justify-between text-sm gap-2">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {r.count} <span className="text-xs">({r.pct}%)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
