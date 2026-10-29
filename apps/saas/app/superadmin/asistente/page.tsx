import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import AssistantLog, { ASSISTANT_LOG_RETENTION_DAYS } from '@/models/AssistantLog'
import Tenant from '@/models/Tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, DollarSign, LifeBuoy, ThumbsDown, ThumbsUp, ShieldAlert } from 'lucide-react'
import { assistantModel, isLlmConfigured } from '@/lib/assistant/llm'
import { monthlyBudgetUsd, supportWhatsapp } from '@/lib/assistant/config'

// ============================================================================
// /superadmin/asistente — TEO: costo real, derivaciones a soporte y respuestas
// con pulgar abajo (dónde falla la documentación). Harness §«Bitácora».
// El layout de /superadmin ya exige rol superadmin.
// ============================================================================

export const dynamic = 'force-dynamic'

interface Row {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  role: string
  plan: string
  question: string
  reply: string
  filter: string | null
  rating: number | null
  escalated: boolean
  docs: string[]
  createdAt: Date
}

const FILTER_LABELS: Record<string, string> = {
  entrada: 'Filtro de entrada',
  salida: 'Filtro de salida',
  limite: 'Límite',
  insistencia: 'Insistencia',
  rechazo_modelo: 'Rechazo del modelo',
  error: 'Error del proveedor',
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function usd(n: number): string {
  return `US$ ${n.toFixed(n < 1 ? 4 : 2)}`
}

export default async function AssistantAdminPage() {
  await connectDB()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [[totals], byFilter, escalated, thumbsDown] = await Promise.all([
    AssistantLog.aggregate<{ count: number; usd: number; up: number; down: number; escalated: number; users: string[] }>([
      { $match: { createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          usd: { $sum: '$costUsd' },
          up: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          down: { $sum: { $cond: [{ $eq: ['$rating', -1] }, 1, 0] } },
          escalated: { $sum: { $cond: ['$escalated', 1, 0] } },
          users: { $addToSet: '$userId' },
        },
      },
    ]),
    AssistantLog.aggregate<{ _id: string | null; count: number }>([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: '$filter', count: { $sum: 1 } } },
    ]),
    AssistantLog.find({ escalated: true }).sort({ escalatedAt: -1 }).limit(30).lean<Row[]>(),
    AssistantLog.find({ rating: -1 }).sort({ createdAt: -1 }).limit(30).lean<Row[]>(),
  ])

  const tenantIds = [...new Set([...escalated, ...thumbsDown].map((r) => String(r.tenantId)))]
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean<{ _id: unknown; name: string; slug: string }[]>()
  const tenantName = new Map(tenants.map((t) => [String(t._id), `${t.name} (${t.slug})`]))

  const count = totals?.count ?? 0
  const spent = totals?.usd ?? 0
  const budget = monthlyBudgetUsd()

  const list = (rows: Row[], empty: string) =>
    rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={String(r._id)} className="py-3 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{tenantName.get(String(r.tenantId)) ?? 'Negocio'}</span>
              <span>· {r.role} · plan {r.plan}</span>
              <span>· {fmtDate(r.createdAt)}</span>
              {r.filter && <span className="rounded bg-muted px-1.5 py-0.5">{FILTER_LABELS[r.filter] ?? r.filter}</span>}
            </div>
            <p><span className="font-medium">Pregunta:</span> {r.question}</p>
            <p className="text-muted-foreground whitespace-pre-line"><span className="font-medium text-foreground">TEO:</span> {r.reply}</p>
            {r.docs.length > 0 && <p className="text-xs text-muted-foreground">Docs: {r.docs.join(', ')}</p>}
          </li>
        ))}
      </ul>
    )

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="h-6 w-6" /> TEO — Asistente de soporte</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLlmConfigured() ? `Activo · modelo ${assistantModel()}` : 'Inactivo: falta ANTHROPIC_API_KEY (el widget muestra «próximamente»)'}
          {' · '}Soporte: {supportWhatsapp() ? `WhatsApp ${supportWhatsapp()}` : 'sin WhatsApp configurado (ASSISTANT_SUPPORT_WHATSAPP)'}
          {' · '}Retención de conversaciones: {ASSISTANT_LOG_RETENTION_DAYS} días
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Bot className="h-4 w-4" /> Mensajes del mes</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{count}</p><p className="text-xs text-muted-foreground">{totals?.users.length ?? 0} usuarios</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><DollarSign className="h-4 w-4" /> Gasto del mes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{usd(spent)}</p>
            <p className="text-xs text-muted-foreground">Tope {usd(budget)} · {count > 0 ? `${usd(spent / count)} por mensaje` : 'sin mensajes'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><ThumbsUp className="h-4 w-4" /> Valoraciones</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals?.up ?? 0} <span className="text-base text-muted-foreground">/ {totals?.down ?? 0} 👎</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><LifeBuoy className="h-4 w-4" /> Derivaciones</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals?.escalated ?? 0}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Controles que actuaron (mes)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          {byFilter.filter((f) => f._id).length === 0 ? (
            <span className="text-muted-foreground">Ninguno</span>
          ) : (
            byFilter
              .filter((f) => f._id)
              .map((f) => (
                <span key={String(f._id)} className="rounded-full border border-border px-3 py-1">
                  {FILTER_LABELS[f._id!] ?? f._id}: <strong>{f.count}</strong>
                </span>
              ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><LifeBuoy className="h-4 w-4" /> Pidieron contactar a soporte</CardTitle></CardHeader>
        <CardContent>{list(escalated, 'Nadie pidió soporte todavía.')}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ThumbsDown className="h-4 w-4" /> Respuestas que no sirvieron</CardTitle></CardHeader>
        <CardContent>{list(thumbsDown, 'Sin pulgares abajo. 🎉')}</CardContent>
      </Card>
    </div>
  )
}
