'use client'

// ── PrinterAgentTokenCard ────────────────────────────────────────────────────
//
// Estado del agente de impresión de la sede seleccionada + token propio.
// Generar el token hace que la sede EXIJA token en print-jobs: el agente de
// esa PC deja de imprimir hasta que se cargue el token con SETUP.bat.

import { useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, ShieldCheck, ShieldAlert, Copy, Check, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface AgentStatus {
  hasToken: boolean
  lastSeenAt: string | null
  version: string | null
  tokenPresent: boolean
}

interface Props {
  tenantSlug: string
  locationId: string
  locationName: string
  status: AgentStatus
  onChange: (status: AgentStatus) => void
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'Nunca se conectó'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 2) return 'Conectado ahora'
  if (minutes < 60) return `Última conexión hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `Última conexión hace ${hours} h`
  return `Última conexión el ${new Date(iso).toLocaleDateString('es-AR')}`
}

export default function PrinterAgentTokenCard({ tenantSlug, locationId, locationName, status, onChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    const msg = status.hasToken
      ? `¿Rotar el token de ${locationName}? El agente actual deja de imprimir hasta cargar el token nuevo.`
      : `¿Generar token para ${locationName}? Desde ahora el agente de esta sede necesita el token para imprimir.`
    if (!window.confirm(msg)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}/agent-token`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const { token } = await res.json()
      setNewToken(token)
      setCopied(false)
      onChange({ ...status, hasToken: true })
    } catch {
      toast.error('No se pudo generar el token')
    } finally {
      setLoading(false)
    }
  }

  async function revoke() {
    if (!window.confirm(`¿Quitar el token de ${locationName}? El agente vuelve a imprimir sin token.`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}/agent-token`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setNewToken(null)
      onChange({ ...status, hasToken: false })
      toast.success('Token revocado')
    } catch {
      toast.error('No se pudo revocar el token')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!newToken) return
    await navigator.clipboard.writeText(newToken)
    setCopied(true)
    toast.success('Token copiado')
  }

  return (
    <Card className="border-2 border-border/60 rounded-[2rem] bg-card">
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={status.hasToken
              ? 'w-10 h-10 shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center'
              : 'w-10 h-10 shrink-0 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center'}>
              {status.hasToken ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Agente de impresión · {locationName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatLastSeen(status.lastSeenAt)}
                {status.version ? ` · v${status.version}` : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {status.hasToken
                  ? 'Protegido con token: solo el agente de esta sede puede leer los trabajos de impresión.'
                  : 'Sin token: cualquiera que conozca el id de la sede puede consultar los trabajos de impresión.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {status.hasToken && (
              <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs" onClick={revoke} disabled={loading}>
                Quitar token
              </Button>
            )}
            <Button size="sm" className="rounded-xl font-bold text-xs gap-2" onClick={generate} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {status.hasToken ? 'Rotar token' : 'Generar token'}
            </Button>
          </div>
        </div>

        {newToken && (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-xs font-bold text-foreground">
              Copialo ahora: no se vuelve a mostrar.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-xl bg-background border border-border/60 px-3 py-2 text-xs font-mono">
                {newToken}
              </code>
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs font-bold" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              En la PC de la sede, ejecutá <strong>SETUP.bat</strong> y pegá el token cuando lo pida
              (&quot;Token del agente de la sede&quot;). Hasta que lo cargues, esta sede no imprime.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
