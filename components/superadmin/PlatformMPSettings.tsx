'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  isConfigured: boolean
  hasAccessToken: boolean
  hasWebhookSecret: boolean
  accessTokenHint: string | null
  webhookSecretHint: string | null
}

export default function PlatformMPSettings({
  isConfigured: initialConfigured,
  hasAccessToken: initialHasToken,
  hasWebhookSecret: initialHasSecret,
  accessTokenHint: initialTokenHint,
  webhookSecretHint: initialSecretHint,
}: Props) {
  const [accessToken, setAccessToken]     = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showToken, setShowToken]         = useState(false)
  const [showSecret, setShowSecret]       = useState(false)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [success, setSuccess]             = useState(false)

  const [isConfigured, setIsConfigured]       = useState(initialConfigured)
  const [hasToken, setHasToken]               = useState(initialHasToken)
  const [hasSecret, setHasSecret]             = useState(initialHasSecret)
  const [tokenHint, setTokenHint]             = useState(initialTokenHint)
  const [secretHint, setSecretHint]           = useState(initialSecretHint)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken && !webhookSecret) return

    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const res = await fetch('/api/superadmin/platform-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(accessToken   && { accessToken }),
          ...(webhookSecret && { webhookSecret }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')

      setSuccess(true)
      if (accessToken)   { setHasToken(true);  setTokenHint('••••••••' + accessToken.slice(-6)); setAccessToken('') }
      if (webhookSecret) { setHasSecret(true); setSecretHint('••••••••' + webhookSecret.slice(-6)); setWebhookSecret('') }
      setIsConfigured(
        (accessToken ? true : hasToken) && (webhookSecret ? true : hasSecret)
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-border/40 bg-muted/20">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <ShieldCheck size={20} className="text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-foreground text-sm">MercadoPago — Facturación de la plataforma</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            Credenciales del owner usadas para cobrarle a los tenants. Se guardan encriptadas (AES-256).
          </p>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold',
          isConfigured
            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
        )}>
          {isConfigured
            ? <><CheckCircle2 size={12} /> Configurado</>
            : <><AlertCircle size={12} /> Pendiente</>
          }
        </div>
      </div>

      {/* Estado actual */}
      <div className="grid grid-cols-2 gap-3 px-6 py-4 bg-muted/10 border-b border-border/40">
        <StatusRow label="Access Token" hint={tokenHint} ok={hasToken} />
        <StatusRow label="Webhook Secret" hint={secretHint} ok={hasSecret} />
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
        <p className="text-xs text-muted-foreground font-medium">
          Dejá vacío el campo que no quieras actualizar. Obtenés estas credenciales en{' '}
          <a
            href="https://www.mercadopago.com.ar/developers/panel/app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            mercadopago.com.ar/developers/panel/app
          </a>
        </p>

        {/* Access Token */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Access Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={tokenHint ?? 'APP_USR-...'}
              className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Webhook Secret */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Webhook Secret
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={secretHint ?? 'APP_USR-...'}
              className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm">
            <CheckCircle2 size={14} /> Credenciales guardadas correctamente
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (!accessToken && !webhookSecret)}
          className="w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar credenciales'}
        </button>
      </form>

      {/* Instrucciones webhook */}
      <div className="px-6 pb-5">
        <div className="rounded-xl bg-muted/30 border border-border/40 p-4 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">URL del webhook</p>
          <p className="font-mono text-xs text-foreground break-all select-all">
            {typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.com'}/api/webhooks/mp-subscription
          </p>
          <p className="text-[11px] text-muted-foreground">
            Configurá esta URL en el panel de MercadoPago → Notificaciones → Tipo: subscription_preapproval
          </p>
        </div>
      </div>
    </div>
  )
}

function StatusRow({ label, hint, ok }: { label: string; hint: string | null; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        : <AlertCircle size={14} className="text-amber-500 shrink-0" />
      }
      <div>
        <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
        <p className="text-xs font-mono text-foreground">{hint ?? 'No configurado'}</p>
      </div>
    </div>
  )
}
