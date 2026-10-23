'use client'

// ============================================================================
// Split de MercadoPago del comercio — panel del superadmin
// ============================================================================
// · Estado: candado, cuentas y su conexión, si MercadoPago está pausado.
// · Conectar: en esta computadora (el dueño inicia sesión en su MercadoPago
//   acá) o con un link de un solo uso que se le manda al dueño.
// · Controlar ahora contra MercadoPago y abrir/cerrar el candado.
// Ver lib/mp-split-guard para las reglas.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Copy, Link2, Loader2, Lock, LockOpen, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type AccountState = 'connected' | 'expired' | 'revoked' | 'not_connected'

interface SplitView {
  tenant: { id: string; slug: string; name: string }
  required: boolean
  lockedExplicitly: boolean | null
  lockedAt: string | null
  mpPaused: boolean
  accounts: Array<{ accountId: string; label: string; isActive: boolean; state: AccountState; authorizedAt: string | null; expiresAt: string | null; revokedAt: string | null; mpUserId: number | null }>
  pendingLinks: Array<{ id: string; accountId: string | null; expiresAt: string; createdBy: string }>
}

const STATE: Record<AccountState, { label: string; tone: string }> = {
  connected: { label: 'Split conectado', tone: 'bg-emerald-100 text-emerald-800' },
  expired: { label: 'Token vencido', tone: 'bg-amber-100 text-amber-900' },
  revoked: { label: 'Permiso quitado en MercadoPago', tone: 'bg-red-100 text-red-800' },
  not_connected: { label: 'Sin split', tone: 'bg-muted text-muted-foreground' },
}
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export default function MpSplitPanel({ tenantId }: { tenantId: string }) {
  const [view, setView] = useState<SplitView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; expiresAt: string; label: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const call = useCallback(async (method: 'GET' | 'POST', body?: object) => {
    const res = await fetch(`/api/superadmin/tenants/${tenantId}/mp-split`, {
      method,
      cache: 'no-store',
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'No se pudo completar')
    return json
  }, [tenantId])

  const load = useCallback(async () => {
    try {
      setView(await call('GET'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sin conexión')
    }
  }, [call])

  useEffect(() => {
    load()
  }, [load])

  async function run(key: string, body: object, after?: (json: SplitView & { url?: string; expiresAt?: string }) => void) {
    setBusy(key)
    setError(null)
    try {
      const json = await call('POST', body)
      setView(json)
      after?.(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar')
    } finally {
      setBusy(null)
    }
  }

  if (!view) {
    return (
      <Card className="mb-6 rounded-2xl"><CardContent className="p-6">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />}
      </CardContent></Card>
    )
  }

  const message = link ? `Hola! Para que tus clientes paguen con MercadoPago en TakeasyGO, autorizá tu cuenta desde este link (sirve una sola vez y vence en 48 h): ${link.url}` : ''

  return (
    <Card className="mb-6 rounded-2xl border-2">
      <CardHeader className="border-b p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck size={18} aria-hidden className="text-[#009EE3]" /> Split de MercadoPago</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge className={view.required ? 'bg-emerald-600' : 'bg-muted text-muted-foreground'}>
              {view.required ? <><Lock size={12} aria-hidden /> Candado activo</> : <><LockOpen size={12} aria-hidden /> Sin candado</>}
            </Badge>
            {view.mpPaused && <Badge className="bg-red-600">MercadoPago pausado</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Cómo funciona.</strong> El dueño autoriza a TakeasyGO en su cuenta de MercadoPago. Sus credenciales no se tocan y la plata sigue cayendo en su cuenta; MercadoPago descuenta sola la comisión en cada cobro.</p>
          <p>Con <strong className="text-foreground">candado</strong>, el admin del comercio no ve esta conexión ni la puede reemplazar ni borrar, y MercadoPago solo cobra con split: si se cae (por ejemplo, el dueño quita el permiso desde su MercadoPago), se <strong className="text-foreground">pausa</strong> en el comercio hasta reconectar. Nunca cobra sin comisión.</p>
        </div>

        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}

        {view.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">El comercio todavía no cargó su cuenta de MercadoPago (Configuración → Pagos). Cuando la cargue, podés conectar el split desde acá.</p>
        ) : (
          <ul className="space-y-3">
            {view.accounts.map((a) => (
              <li key={a.accountId} className={cn('rounded-xl border-2 p-4 space-y-3', a.isActive ? 'border-[#009EE3]/40' : 'border-border/60')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.label} {a.isActive && <span className="ml-1 text-xs font-bold text-[#009EE3]">· cobra ahora</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      Autorizado: {fmt(a.authorizedAt)} · Vence: {fmt(a.expiresAt)}{a.mpUserId ? ` · Usuario MP ${a.mpUserId}` : ''}{a.revokedAt ? ` · Permiso quitado: ${fmt(a.revokedAt)}` : ''}
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', STATE[a.state].tone)}>{STATE[a.state].label}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={a.state === 'connected' ? 'outline' : 'default'} disabled={busy !== null} onClick={() => run(`link-${a.accountId}`, { action: 'link', accountId: a.accountId }, (j) => j.url && setLink({ url: j.url, expiresAt: j.expiresAt!, label: a.label }))}>
                    {busy === `link-${a.accountId}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="mr-1 h-4 w-4" aria-hidden />}
                    {a.state === 'connected' ? 'Link para reconectar' : 'Generar link para el dueño'}
                  </Button>
                  <a
                    href={`/api/${view.tenant.slug}/admin/mp-oauth/connect${a.accountId !== 'legacy' ? `?accountId=${a.accountId}` : ''}`}
                    className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
                    title="El dueño inicia sesión en su cuenta de MercadoPago en esta computadora. Cerrá antes tu propia sesión de MercadoPago."
                  >
                    Conectar en esta computadora
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}

        {link && (
          <div className="space-y-2 rounded-xl border-2 border-[#009EE3]/40 bg-sky-50 p-4 dark:bg-sky-950/30">
            <p className="text-sm font-bold">Link para «{link.label}» — se muestra una sola vez</p>
            <div className="flex gap-2">
              <input readOnly value={link.url} className="h-9 flex-1 rounded-md border bg-background px-2 font-mono text-xs" aria-label="Link de autorización" onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* seleccionar a mano */ } }}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              </Button>
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-md bg-[#25D366] px-3 text-sm font-bold text-white">
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
            </div>
            <p className="text-xs text-muted-foreground">Vence el {fmt(link.expiresAt)}. El dueño tiene que iniciar sesión con la cuenta de MercadoPago donde cobra el comercio.</p>
          </div>
        )}

        {view.pendingLinks.length > 0 && !link && (
          <p className="text-xs text-muted-foreground">Hay {view.pendingLinks.length} link(s) sin usar, el último vence el {fmt(view.pendingLinks[0].expiresAt)}.</p>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('check', { action: 'check' })}>
            {busy === 'check' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden />} Controlar ahora con MercadoPago
          </Button>
          {view.required ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy !== null}
              onClick={() => {
                if (confirm(`¿Quitar el candado de ${view.tenant.name}? El admin podrá cambiar la conexión y MercadoPago cobrará aunque no haya split (sin comisión). Usalo solo si el comercio deja la plataforma.`)) run('unlock', { action: 'unlock' })
              }}
            >
              <LockOpen className="mr-1 h-4 w-4" aria-hidden /> Quitar candado
            </Button>
          ) : (
            <Button size="sm" disabled={busy !== null} onClick={() => run('lock', { action: 'lock' })}>
              <Lock className="mr-1 h-4 w-4" aria-hidden /> Poner candado
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
