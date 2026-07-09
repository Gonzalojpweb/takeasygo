'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, ShieldCheck, Zap, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  origin: string
  isConfigured: boolean
  hasAccessToken: boolean
  hasWebhookSecret: boolean
  accessTokenHint: string | null
  webhookSecretHint: string | null
  mpOAuth?: {
    appId: string | null
    appSecretHint: string | null
    redirectUri: string | null
    platformFeePercent: number
    isConfigured: boolean
  }
  platformFees?: {
    takeasygoCommissionPercent: number
  }
}

export default function PlatformMPSettings({
  origin,
  isConfigured: initialConfigured,
  hasAccessToken: initialHasToken,
  hasWebhookSecret: initialHasSecret,
  accessTokenHint: initialTokenHint,
  webhookSecretHint: initialSecretHint,
  mpOAuth: initialMpOAuth,
  platformFees: initialPlatformFees,
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

  // OAuth state
  const [oauthAppId, setOauthAppId]           = useState('')
  const [oauthAppSecret, setOauthAppSecret]   = useState('')
  const [oauthRedirectUri, setOauthRedirectUri] = useState('')
  const [oauthPlatformFee, setOauthPlatformFee] = useState(5)
  const [showOAuthSecret, setShowOAuthSecret] = useState(false)
  const [oauthAppIdError, setOauthAppIdError] = useState<string | null>(null)
  const [oauthIsConfigured, setOAuthIsConfigured] = useState(initialMpOAuth?.isConfigured ?? false)
  const [oauthAppIdHint, setOAuthAppIdHint]   = useState(initialMpOAuth?.appId ?? null)
  const [oauthAppSecretHint, setOAuthAppSecretHint] = useState(initialMpOAuth?.appSecretHint ?? null)
  const [oauthRedirectUriHint, setOAuthRedirectUriHint] = useState(initialMpOAuth?.redirectUri ?? null)
  const [oauthPlatformFeeHint, setOAuthPlatformFeeHint] = useState(initialMpOAuth?.platformFeePercent ?? 5)

  // ── Comisión TakeasyGO ────────────────────────────────────────────
  const [takeasygoCommissionPercent, setTakeasygoCommissionPercent] = useState(
    initialPlatformFees?.takeasygoCommissionPercent ?? 1
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken && !webhookSecret && !oauthAppId && !oauthAppSecret && !oauthRedirectUri) return

    setError(null)
    setOauthAppIdError(null)
    setSuccess(false)
    setLoading(true)

    if (oauthAppId && !/^\d+$/.test(oauthAppId)) {
      setOauthAppIdError('El App ID de MercadoPago debe ser un número')
      setLoading(false)
      return
    }

    try {
      const body: any = {}
      if (accessToken) body.accessToken = accessToken
      if (webhookSecret) body.webhookSecret = webhookSecret

      if (oauthAppId || oauthAppSecret || oauthRedirectUri || oauthPlatformFee !== 5) {
        body.mpOAuth = {}
        if (oauthAppId) body.mpOAuth.appId = oauthAppId
        if (oauthAppSecret) body.mpOAuth.appSecret = oauthAppSecret
        if (oauthRedirectUri) body.mpOAuth.redirectUri = oauthRedirectUri
        if (oauthPlatformFee !== 5) body.mpOAuth.platformFeePercent = oauthPlatformFee
      }

      body.platformFees = {
        takeasygoCommissionPercent,
      }

      const res = await fetch('/api/superadmin/platform-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')

      setSuccess(true)
      if (accessToken)   { setHasToken(true);  setTokenHint('••••••••' + accessToken.slice(-6)); setAccessToken('') }
      if (webhookSecret) { setHasSecret(true); setSecretHint('••••••••' + webhookSecret.slice(-6)); setWebhookSecret('') }
      setIsConfigured(
        (accessToken ? true : hasToken) && (webhookSecret ? true : hasSecret)
      )

      // OAuth updates
      if (oauthAppId) { setOAuthAppIdHint(oauthAppId); setOauthAppId('') }
      if (oauthAppSecret) { setOAuthAppSecretHint('••••••••' + oauthAppSecret.slice(-6)); setOauthAppSecret('') }
      if (oauthRedirectUri) { setOAuthRedirectUriHint(oauthRedirectUri); setOauthRedirectUri('') }
      if (oauthPlatformFee !== 5) { setOAuthPlatformFeeHint(oauthPlatformFee) }
      setOAuthIsConfigured(
        (oauthAppId ? true : !!oauthAppIdHint) &&
        (oauthAppSecret ? true : !!oauthAppSecretHint) &&
        (oauthRedirectUri ? true : !!oauthRedirectUriHint)
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
          disabled={loading || (!accessToken && !webhookSecret && !oauthAppId && !oauthAppSecret && !oauthRedirectUri)}
          className="w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar credenciales'}
        </button>
      </form>

      {/* OAuth Configuration Section */}
      <div className="border-t border-border/40">
        <div className="flex items-center gap-4 px-6 py-5 border-b border-border/40 bg-muted/20">
          <div className="p-2.5 rounded-xl bg-[#009EE3]/10">
            <Zap size={20} className="text-[#009EE3]" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-foreground text-sm">OAuth — Split de Pagos (Marketplace)</p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Configuración para que TakeasyGO cobre comisión automática en cada venta. Credenciales encriptadas.
            </p>
          </div>
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold',
            oauthIsConfigured
              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
          )}>
            {oauthIsConfigured
              ? <><CheckCircle2 size={12} /> Configurado</>
              : <><AlertCircle size={12} /> Pendiente</>
            }
          </div>
        </div>

        {/* OAuth Estado actual */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4 bg-muted/10 border-b border-border/40">
          <StatusRow label="App ID" hint={oauthAppIdHint} ok={!!oauthAppIdHint} />
          <StatusRow label="App Secret" hint={oauthAppSecretHint} ok={!!oauthAppSecretHint} />
          <StatusRow label="Redirect URI" hint={oauthRedirectUriHint} ok={!!oauthRedirectUriHint} />
          <StatusRow label="Comisión %" hint={`${oauthPlatformFeeHint}%`} ok={true} />
        </div>

        {/* OAuth Form */}
        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
          <p className="text-xs text-muted-foreground font-medium">
            Configuración de la aplicación de MercadoPago para OAuth Marketplace. Obtenés estas credenciales en{' '}
            <a
              href="https://www.mercadopago.com.ar/developers/panel/app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              mercadopago.com.ar/developers/panel/app
            </a>
          </p>

          {/* App ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              App ID
            </label>
            <input
              type="text"
              value={oauthAppId}
              onChange={(e) => { setOauthAppId(e.target.value); setOauthAppIdError(null) }}
              placeholder={oauthAppIdHint ?? '1234567890'}
              className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {oauthAppIdError && (
              <p className="text-[11px] text-destructive mt-1">{oauthAppIdError}</p>
            )}
          </div>

          {/* App Secret */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              App Secret
            </label>
            <div className="relative">
              <input
                type={showOAuthSecret ? 'text' : 'password'}
                value={oauthAppSecret}
                onChange={(e) => setOauthAppSecret(e.target.value)}
                placeholder={oauthAppSecretHint ?? '••••••••'}
                className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowOAuthSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOAuthSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Redirect URI */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Redirect URI
            </label>
            <input
              type="text"
              value={oauthRedirectUri}
              onChange={(e) => setOauthRedirectUri(e.target.value)}
              placeholder={oauthRedirectUriHint ?? 'https://tudominio.com/api/mp-oauth/callback'}
              className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[10px] text-muted-foreground">
              Esta URL debe estar configurada en tu aplicación de MercadoPago como URL de redirección OAuth.
            </p>
          </div>

          {/* Platform Fee Percent */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Porcentaje de Comisión (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={oauthPlatformFee}
              onChange={(e) => setOauthPlatformFee(parseFloat(e.target.value) || 0)}
              className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[10px] text-muted-foreground">
              Porcentaje que TakeasyGO cobra en cada venta cuando el tenant tiene OAuth conectado.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || (!oauthAppId && !oauthAppSecret && !oauthRedirectUri && oauthPlatformFee === 5)}
            className="w-full py-2.5 rounded-xl bg-[#009EE3] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-[#008CCC] transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar configuración OAuth'}
          </button>
        </form>
      </div>

      {/* ── Comisión TakeasyGO ──────────────────────────────────────── */}
      <div className="border-t border-border/40">
        <div className="flex items-center gap-4 px-6 py-5 border-b border-border/40 bg-muted/20">
          <div className="p-2.5 rounded-xl bg-emerald-100">
            <Percent size={20} className="text-emerald-700" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">Comisión TakeasyGO</p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Porcentaje invisible que TakeasyGO cobra en cada venta (se suma al recargo del tenant).
              No se muestra al tenant.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Comisión global (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={takeasygoCommissionPercent}
                onChange={e => setTakeasygoCommissionPercent(parseFloat(e.target.value) || 0)}
                className="w-full mt-1.5 bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Se aplica a todas las ventas de todos los tenants. No visible para los restaurantes.
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-emerald-700 transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar comisión'}
          </button>
        </div>
      </div>

      {/* Instrucciones webhook */}
      <div className="px-6 pb-5">
        <div className="rounded-xl bg-muted/30 border border-border/40 p-4 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">URL del webhook</p>
          <p className="font-mono text-xs text-foreground break-all select-all">
            {origin}/api/webhooks/mp-subscription
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
