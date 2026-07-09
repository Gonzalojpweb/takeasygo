'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bell, Smartphone, Users, Send, Globe,
  Loader2, CheckCircle2, XCircle, RefreshCw, History,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface TenantStat {
  _id: string
  slug: string
  name: string
  total: number
  linked: number
}

interface StatsData {
  totalSubscriptions: number
  totalLinked: number
  totalUnlinked: number
  tenants: TenantStat[]
}

interface LogEntry {
  _id: string
  title: string
  body: string
  targetType: string
  targetCount: number
  successCount: number
  failCount: number
  createdAt: string
}

export default function SuperAdminPushPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/push/stats')
      const data = await res.json()
      setStats(data)
    } catch {
      toast.error('Error al cargar estadísticas')
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    setLogsLoading(true)
    try {
      const res = await fetch('/api/superadmin/push/logs?limit=10')
      const data = await res.json()
      setLogs(data.data || [])
      setLogsTotal(data.total || 0)
    } catch {
      // ignore
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchLogs()
  }, [])

  async function handleBroadcast() {
    if (!title.trim() || !body.trim()) {
      toast.error('Completá título y mensaje')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/superadmin/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Broadcast enviado: ${json.tenantsTargeted} tenantes, ${json.totalSuccess} éxitos, ${json.totalFail} fallos`)
      setTitle('')
      setBody('')
      setUrl('')
      fetchStats()
      fetchLogs()
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  async function handleBackfill() {
    setBackfilling(true)
    try {
      const res = await fetch('/api/push/backfill', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Backfill completado: ${json.updatedViaMember} vía members, ${json.updatedViaOrder} vía órdenes, ${json.skipped} saltados`)
      fetchStats()
    } catch (err: any) {
      toast.error(err.message || 'Error en backfill')
    } finally {
      setBackfilling(false)
    }
  }

  const adoptPct = stats && stats.totalSubscriptions > 0
    ? Math.round((stats.totalLinked / stats.totalSubscriptions) * 100)
    : 0

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Push Notifications</h1>
          <p className="text-muted-foreground mt-1">Gestión global de notificaciones push en toda la plataforma.</p>
        </div>
        <Button
          onClick={handleBackfill}
          disabled={backfilling}
          variant="outline"
          className="rounded-xl gap-2"
        >
          {backfilling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {backfilling ? 'Vinculando...' : 'Vincular subscriptions'}
        </Button>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border/60 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Smartphone size={20} className="text-blue-500" />
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Total subscriptions</p>
                <p className="text-2xl font-black tabular-nums">{loading ? '...' : stats?.totalSubscriptions ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald-500" />
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Vinculadas</p>
                <p className="text-2xl font-black tabular-nums">{loading ? '...' : stats?.totalLinked ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} className="text-amber-500" />
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Sin vincular</p>
                <p className="text-2xl font-black tabular-nums">{loading ? '...' : stats?.totalUnlinked ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Users size={20} className="text-purple-500" />
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Adopción</p>
                <p className="text-2xl font-black tabular-nums">{loading ? '...' : `${adoptPct}%`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-tenant table */}
      <Card className="bg-card border-border/60 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border/40 bg-muted/10">
          <h2 className="font-bold">Por tenant</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border/40">
                <th className="text-left px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Tenant</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Total subs</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Vinculadas</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Adopción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
              ) : (stats?.tenants ?? []).length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>
              ) : stats?.tenants.map((t, i) => (
                <tr key={t._id} className={`border-b border-border/20 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                  <td className="px-4 py-3 font-bold">{t.name}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{t.total}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{t.linked}</td>
                  <td className="px-4 py-3 text-center">
                    {t.total > 0 ? (
                      <span className="font-bold text-xs">{Math.round((t.linked / t.total) * 100)}%</span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Broadcast form */}
      <Card className="bg-card border-border/60 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border/40 bg-muted/10 flex items-center gap-3">
          <Globe size={18} className="text-primary" />
          <h2 className="font-bold">Broadcast global</h2>
        </div>
        <div className="p-5 space-y-4">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título de la notificación"
            maxLength={120}
            className="w-full bg-muted/30 border-2 border-border/60 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary transition-colors"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Mensaje"
            rows={3}
            maxLength={500}
            className="w-full bg-muted/30 border-2 border-border/60 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary transition-colors resize-none"
          />
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Link opcional (ej: /app)"
            className="w-full bg-muted/30 border-2 border-border/60 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary transition-colors"
          />
          <Button
            onClick={handleBroadcast}
            disabled={!title.trim() || !body.trim() || sending}
            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-6 h-11 gap-2"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Enviando...' : 'Enviar broadcast global'}
          </Button>
        </div>
      </Card>

      {/* History */}
      <Card className="bg-card border-border/60 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border/40 bg-muted/10 flex items-center gap-3">
          <History size={18} className="text-muted-foreground" />
          <h2 className="font-bold">Historial de broadcasts ({logsTotal})</h2>
        </div>
        <div className="overflow-x-auto">
          {logsLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Sin broadcasts aún</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 border-b border-border/40">
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Título</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Fecha</th>
                  <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Target</th>
                  <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Éxito</th>
                  <th className="text-center px-4 py-3 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Fallos</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log._id} className={`border-b border-border/20 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                    <td className="px-4 py-3 font-bold truncate max-w-[200px]">{log.title}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 text-center text-xs">{log.targetCount}</td>
                    <td className="px-4 py-3 text-center text-emerald-500 font-bold">{log.successCount}</td>
                    <td className="px-4 py-3 text-center text-destructive font-bold">{log.failCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
