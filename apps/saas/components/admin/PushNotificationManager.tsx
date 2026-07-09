'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bell, Send, History, Users, Smartphone,
  Loader2, CheckCircle2, XCircle, Clock,
  AlertCircle, Search, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  tenantSlug: string
  tenantId: string
}

interface MemberRow {
  _id: string
  name: string
  phone: string
  email: string
  status: string
  joinedAt: string
  totalOrders: number
  totalSpent: number
  points: number
  tier: string
  hasPush: boolean
}

interface ConsumerRow {
  _id: string
  name: string
  phone: string
  email: string
  totalOrders: number
  totalSpent: number
  lastOrderAt: string | null
  hasPush: boolean
}

interface LogEntry {
  _id: string
  title: string
  body: string
  targetType: string
  targetCount: number
  successCount: number
  failCount: number
  sentByRole: string
  createdAt: string
}

type Tab = 'send' | 'members' | 'consumers' | 'history'

export default function PushNotificationManager({ tenantSlug, tenantId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('send')

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/60 pb-2">
        {[
          { id: 'send' as Tab, label: 'Enviar', icon: Send },
          { id: 'members' as Tab, label: 'Miembros', icon: Users },
          { id: 'consumers' as Tab, label: 'Consumidores', icon: Smartphone },
          { id: 'history' as Tab, label: 'Historial', icon: History },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'send' && <SendTab tenantSlug={tenantSlug} />}
      {activeTab === 'members' && <MembersTab tenantSlug={tenantSlug} />}
      {activeTab === 'consumers' && <ConsumersTab tenantSlug={tenantSlug} />}
      {activeTab === 'history' && <HistoryTab tenantSlug={tenantSlug} />}
    </div>
  )
}

function SendTab({ tenantSlug }: { tenantSlug: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [targetType, setTargetType] = useState<'all_members' | 'all_consumers'>('all_members')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/push/${targetType === 'all_members' ? 'members-status' : 'consumers-status'}?limit=1&pushFilter=with_push`)
      const json = await res.json()
      setPreviewCount(json.total ?? 0)
    } catch {
      setPreviewCount(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [tenantSlug, targetType])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  useEffect(() => {
    fetch(`/api/${tenantSlug}/push/logs?limit=1`)
      .then(r => r.json())
      .then(json => {
        if (json.data?.length > 0) {
          setLastSentAt(json.data[0].createdAt)
        }
      })
      .catch(() => {})
  }, [tenantSlug])

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      toast.error('Completá el título y el mensaje')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim() || undefined, targetType }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          toast.error(json.error || 'Esperá antes de enviar otra notificación')
        } else {
          toast.error(json.error || 'Error al enviar')
        }
        return
      }
      toast.success(`Notificación enviada: ${json.successCount} exitosas, ${json.failCount} fallidas`)
      setTitle('')
      setBody('')
      setUrl('')
      setLastSentAt(new Date().toISOString())
      fetchPreview()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSending(false)
    }
  }

  const canSend = title.trim() && body.trim() && (previewCount ?? 0) > 0

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border/60 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Users size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Alcanzables</p>
                <p className="text-2xl font-black tabular-nums text-foreground">
                  {previewLoading ? '...' : (previewCount ?? 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Último envío</p>
                <p className="text-sm font-bold text-foreground">
                  {lastSentAt ? new Date(lastSentAt).toLocaleString('es-AR') : 'Ninguno'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Bell size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Cooldown</p>
                <p className="text-sm font-bold text-foreground">30 min entre broadcasts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Send form */}
      <Card className="bg-card border-border/60 shadow-lg rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Send size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Enviar notificación</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Todos los mensajes se registran para evitar spam</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-5">
          {/* Target selector */}
          <div>
            <p className="text-sm font-bold text-foreground mb-2">Destino</p>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                targetType === 'all_members' ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-border'
              }`}>
                <input type="radio" name="target" value="all_members" checked={targetType === 'all_members'}
                  onChange={() => setTargetType('all_members')} className="sr-only" />
                <Users size={20} className={targetType === 'all_members' ? 'text-primary' : 'text-muted-foreground'} />
                <div>
                  <p className="text-sm font-bold">Miembros del Club</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Solo miembros activos con push</p>
                </div>
              </label>
              <label className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                targetType === 'all_consumers' ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-border'
              }`}>
                <input type="radio" name="target" value="all_consumers" checked={targetType === 'all_consumers'}
                  onChange={() => setTargetType('all_consumers')} className="sr-only" />
                <Smartphone size={20} className={targetType === 'all_consumers' ? 'text-primary' : 'text-muted-foreground'} />
                <div>
                  <p className="text-sm font-bold">Todos los consumidores</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Incluye no miembros con push</p>
                </div>
              </label>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm font-bold text-foreground block mb-1.5">Título *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Nueva promo disponible"
              maxLength={120}
              className="w-full bg-muted/30 border-2 border-border/60 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-sm font-bold text-foreground block mb-1.5">Mensaje *</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Escribí el mensaje de la notificación..."
              maxLength={500}
              rows={3}
              className="w-full bg-muted/30 border-2 border-border/60 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary transition-colors resize-none"
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">{body.length}/500</p>
          </div>

          {/* URL */}
          <div>
            <label className="text-sm font-bold text-foreground block mb-1.5">Link (opcional)</label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Ej: /club/promos"
              className="w-full bg-muted/30 border-2 border-border/60 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Send button */}
          <div className="flex items-center gap-4 pt-2">
            <Button
              onClick={handleSend}
              disabled={!canSend || sending}
              className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-8 h-12 shadow-lg shadow-primary/20 gap-2 transition-all active:scale-95 text-base"
            >
              {sending
                ? <Loader2 size={18} className="animate-spin" />
                : <Send size={18} />
              }
              {sending ? 'Enviando...' : `Enviar a ${previewCount ?? 0} dispositivo(s)`}
            </Button>
            {!canSend && previewCount === 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle size={12} />
                No hay dispositivos con push para este destino
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function MembersTab({ tenantSlug }: { tenantSlug: string }) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 20

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (search) params.set('search', search)
      const res = await fetch(`/api/${tenantSlug}/push/members-status?${params}`)
      const json = await res.json()
      setMembers(json.data || [])
      setTotal(json.total || 0)
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, page, search])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const pushCount = members.filter(m => m.hasPush).length

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} miembros · <span className="text-emerald-500 font-bold">{pushCount} con push</span>
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar..."
              className="bg-muted/30 border-2 border-border/60 rounded-xl pl-9 pr-3 py-2 text-xs font-medium outline-none focus:border-primary transition-colors w-48"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchMembers} className="rounded-xl">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      <Card className="bg-card border-border/60 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border/40">
                <th className="text-left px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Nombre</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Teléfono</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Push</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Órdenes</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Gastado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : members.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">Sin miembros</td></tr>
              ) : members.map((m, i) => (
                <tr key={m._id} className={`border-b border-border/20 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-foreground">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground/60">{m.tier !== 'none' ? m.tier : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{m.phone || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {m.hasPush
                      ? <CheckCircle2 size={16} className="text-emerald-500 inline" />
                      : <XCircle size={16} className="text-muted-foreground/40 inline" />
                    }
                  </td>
                  <td className="px-4 py-3 text-center font-bold tabular-nums">{m.totalOrders}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">${m.totalSpent.toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl">Anterior</Button>
          <span className="flex items-center text-sm text-muted-foreground font-medium">Página {page} de {Math.ceil(total / limit)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)} className="rounded-xl">Siguiente</Button>
        </div>
      )}
    </motion.div>
  )
}

function ConsumersTab({ tenantSlug }: { tenantSlug: string }) {
  const [consumers, setConsumers] = useState<ConsumerRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [pushFilter, setPushFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 20

  const fetchConsumers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (search) params.set('search', search)
      if (pushFilter) params.set('pushFilter', pushFilter)
      const res = await fetch(`/api/${tenantSlug}/push/consumers-status?${params}`)
      const json = await res.json()
      setConsumers(json.data || [])
      setTotal(json.total || 0)
    } catch {
      setConsumers([])
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, page, search, pushFilter])

  useEffect(() => { fetchConsumers() }, [fetchConsumers])

  const pushCount = consumers.filter(c => c.hasPush).length

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {total} consumidores · <span className="text-emerald-500 font-bold">{pushCount} con push</span>
        </p>
        <div className="flex items-center gap-2">
          <select
            value={pushFilter}
            onChange={e => { setPushFilter(e.target.value); setPage(1) }}
            className="bg-muted/30 border-2 border-border/60 rounded-xl px-3 py-2 text-xs font-medium outline-none"
          >
            <option value="">Todos</option>
            <option value="with_push">Con push</option>
            <option value="without_push">Sin push</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar..."
            className="bg-muted/30 border-2 border-border/60 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-primary transition-colors w-40"
          />
          <Button variant="outline" size="icon" onClick={fetchConsumers} className="rounded-xl">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      <Card className="bg-card border-border/60 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border/40">
                <th className="text-left px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Nombre</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Teléfono</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Push</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Órdenes</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Gastado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : consumers.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">Sin consumidores</td></tr>
              ) : consumers.map((c, i) => (
                <tr key={c._id} className={`border-b border-border/20 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-foreground">{c.name || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {c.hasPush
                      ? <CheckCircle2 size={16} className="text-emerald-500 inline" />
                      : <XCircle size={16} className="text-muted-foreground/40 inline" />
                    }
                  </td>
                  <td className="px-4 py-3 text-center font-bold tabular-nums">{c.totalOrders}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">${c.totalSpent.toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl">Anterior</Button>
          <span className="flex items-center text-sm text-muted-foreground font-medium">Página {page} de {Math.ceil(total / limit)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)} className="rounded-xl">Siguiente</Button>
        </div>
      )}
    </motion.div>
  )
}

function HistoryTab({ tenantSlug }: { tenantSlug: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 15

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/push/logs?page=${page}&limit=${limit}`)
      const json = await res.json()
      setLogs(json.data || [])
      setTotal(json.total || 0)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const TARGET_LABELS: Record<string, string> = {
    all_members: 'Todos los miembros',
    all_consumers: 'Todos los consumidores',
    specific_members: 'Miembros seleccionados',
    specific_consumers: 'Consumidores seleccionados',
    global_broadcast: 'Broadcast global',
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <p className="text-sm text-muted-foreground">{total} notificaciones enviadas</p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <Card className="bg-card border-border/60 rounded-2xl p-12 text-center">
          <Bell size={32} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-bold text-muted-foreground">Aún no enviaste notificaciones</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <Card key={log._id} className="bg-card border-border/60 rounded-2xl overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-foreground truncate">{log.title}</p>
                      <span className="text-[10px] font-bold text-muted-foreground/50 uppercase bg-muted/30 px-2 py-0.5 rounded-full shrink-0">
                        {TARGET_LABELS[log.targetType] || log.targetType}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{log.body}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('es-AR')}</p>
                    <div className="flex items-center gap-3 mt-1 justify-end">
                      <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 size={10} /> {log.successCount}
                      </span>
                      {log.failCount > 0 && (
                        <span className="text-[10px] font-bold text-destructive flex items-center gap-1">
                          <XCircle size={10} /> {log.failCount}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-muted-foreground/60 flex items-center gap-1">
                        <Users size={10} /> {log.targetCount}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl">Anterior</Button>
          <span className="flex items-center text-sm text-muted-foreground font-medium">Página {page} de {Math.ceil(total / limit)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)} className="rounded-xl">Siguiente</Button>
        </div>
      )}
    </motion.div>
  )
}
