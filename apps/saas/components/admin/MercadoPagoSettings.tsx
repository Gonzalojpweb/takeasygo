'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, Key, Lock, Loader2, Plus, Trash2, Radio, Stethoscope } from 'lucide-react'
import { cn } from '@/lib/utils'

import MpOAuthConnectButton from './MpOAuthConnectButton'

interface MpAccount {
  _id: string
  label: string
  isActive: boolean
  hasAccessToken: boolean
  hasPublicKey: boolean
  hasWebhookSecret: boolean
  oauthIsConnected: boolean
  oauthAuthorizedAt?: string | null
  oauthExpiresAt?: string | null
  createdAt: string
  mpUserId?: number | null
  oauthMpUserId?: number | null
}

interface VerifyResult {
  ok: boolean
  reason: string | null
  message: string
  accountId: string | null
  accountLabel: string | null
  legacy: boolean
  tokenSource: 'oauth' | 'manual' | null
  httpStatus: number | null
  user: { id: number | null; nickname: string | null; email: string | null; firstName: string | null } | null
  oauth: {
    isConnected: boolean
    hasRefreshToken: boolean
    expiresAt: string | null
    status: 'valid' | 'soon' | 'expired' | 'unknown' | null
    daysRemaining: number | null
    ttlDays: number
  }
}

interface Props {
  tenantSlug: string
  isConfigured: boolean
  mpOAuth?: {
    isConnected: boolean
    authorizedAt?: string | null
  }
  mpAccounts?: MpAccount[]
  mpMode?: 'shared' | 'perLocation'
  mpPerLocationEnabled?: boolean
  /** Candado del split (tenant.mpSplitGuard.locked). null = se deduce. Ver lib/mp-split-guard. */
  splitLocked?: boolean | null
}

/** ¿El split de esta cuenta está vigente? (réplica de isOAuthValid) */
function splitConnected(a: { oauthIsConnected?: boolean; oauthExpiresAt?: string | null }): boolean {
  return !!a.oauthIsConnected && (!a.oauthExpiresAt || new Date(a.oauthExpiresAt).getTime() > Date.now())
}

export default function MercadoPagoSettings({ tenantSlug, isConfigured, mpOAuth, mpAccounts = [], mpMode = 'shared', mpPerLocationEnabled = false, splitLocked = null }: Props) {
  // Candado del split: una vez conectado, lo administra TakeasyGO. El admin
  // no ve el botón de conexión ni puede borrar la cuenta conectada; si el
  // split se cae, MercadoPago queda pausado hasta reconectar.
  const everConnected = !!mpOAuth?.authorizedAt || mpAccounts.some((a) => !!a.oauthAuthorizedAt)
  const splitRequired = splitLocked === true || (splitLocked == null && everConnected)
  const activeAccount = mpAccounts.find((a) => a.isActive) ?? null
  const activeSplitOk = activeAccount ? splitConnected(activeAccount) : !!mpOAuth?.isConnected
  const mpPaused = splitRequired && (!!activeAccount || isConfigured) && !activeSplitOk
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [mode, setMode] = useState<'shared' | 'perLocation'>(mpPerLocationEnabled ? mpMode : 'shared')

  // ── Add new account ──
  const [newLabel, setNewLabel] = useState('')
  const [newForm, setNewForm] = useState({ accessToken: '', publicKey: '', webhookSecret: '' })

  // ── Edit existing account ──
  const [editLabel, setEditLabel] = useState('')
  const [editForm, setEditForm] = useState({ accessToken: '', publicKey: '', webhookSecret: '' })

  // ── Verificar conexión (diagnóstico) ──
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/mercadopago/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel,
          accessToken: newForm.accessToken,
          publicKey: newForm.publicKey,
          webhookSecret: newForm.webhookSecret,
          isActive: mpAccounts.length === 0, // first account is auto-active
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('Cuenta creada correctamente')
      setShowAddForm(false)
      setNewLabel('')
      setNewForm({ accessToken: '', publicKey: '', webhookSecret: '' })
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear cuenta')
    } finally {
      setLoading(false)
    }
  }

  async function handleActivate(accountId: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/mercadopago/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cuenta activada')
      router.refresh()
    } catch {
      toast.error('Error al activar cuenta')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(accountId: string) {
    if (!confirm('¿Eliminar esta cuenta?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/mercadopago/accounts/${accountId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('Cuenta eliminada')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar cuenta')
    } finally {
      setLoading(false)
    }
  }

  async function handleEditAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!editingAccountId) return
    setLoading(true)
    try {
      const body: any = { label: editLabel }
      if (editForm.accessToken) body.accessToken = editForm.accessToken
      if (editForm.publicKey) body.publicKey = editForm.publicKey
      if (editForm.webhookSecret) body.webhookSecret = editForm.webhookSecret

      const res = await fetch(`/api/${tenantSlug}/settings/mercadopago/accounts/${editingAccountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('Cuenta actualizada')
      setEditingAccountId(null)
      router.refresh()
    } catch {
      toast.error('Error al actualizar cuenta')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(accountId: string | 'legacy') {
    setVerifyingId(accountId)
    setVerifyResult(null)
    try {
      const res = await fetch(
        `/api/${tenantSlug}/settings/mercadopago/verify?accountId=${accountId}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setVerifyResult(data as VerifyResult)
      if (!data.ok) toast.error(data.message || 'La verificación falló')
    } catch (err: any) {
      toast.error(err.message || 'Error al verificar la conexión')
    } finally {
      setVerifyingId(null)
    }
  }

  const labelCls = "text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-2 block"
  const inputCls = 'w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 focus:bg-white text-foreground text-sm font-mono rounded-2xl px-4 py-3 outline-none transition-all shadow-sm'

  return (
    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#009EE3]/10 flex items-center justify-center text-[#009EE3]">
              <ShieldCheck size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Pasarela de Pagos</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Configura tu integración con Mercado Pago</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border-2",
              isConfigured || mpAccounts.length > 0
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
            )}
          >
            {isConfigured || mpAccounts.length > 0 ? 'Conectado' : 'Pendiente'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-8 space-y-8">
        {/* ── Modo: compartido o por sede ── */}
        {mpAccounts.length > 1 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Modo de cuentas</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('shared')}
                disabled={!mpPerLocationEnabled}
                className={cn(
                  'p-4 rounded-2xl border-2 text-left transition-all',
                  mode === 'shared'
                    ? 'border-[#009EE3] bg-[#009EE3]/5'
                    : 'border-border/60 bg-muted/20 hover:border-border',
                  !mpPerLocationEnabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <p className="text-sm font-bold">Compartido</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Todas las sedes usan la cuenta activa.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('perLocation')}
                disabled={!mpPerLocationEnabled}
                className={cn(
                  'p-4 rounded-2xl border-2 text-left transition-all',
                  mode === 'perLocation'
                    ? 'border-[#009EE3] bg-[#009EE3]/5'
                    : 'border-border/60 bg-muted/20 hover:border-border',
                  !mpPerLocationEnabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <p className="text-sm font-bold">Por sede</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cada sede usa su propia cuenta de Mercado Pago.
                </p>
              </button>
            </div>
            {!mpPerLocationEnabled && (
              <p className="text-[10px] text-muted-foreground/50">
                El modo por sede está deshabilitado. Contactá al administrador para activarlo.
              </p>
            )}
            {mpPerLocationEnabled && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Modo actual: <strong>{mode === 'perLocation' ? 'Por sede' : 'Compartido'}</strong>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || mode === mpMode}
                  onClick={async () => {
                    setLoading(true)
                    try {
                      const res = await fetch(`/api/${tenantSlug}/settings/mercadopago`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mpMode: mode }),
                      })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        toast.error(data.error || 'Error al cambiar modo')
                        return
                      }
                      toast.success(`Modo cambiado a ${mode === 'perLocation' ? 'por sede' : 'compartido'}`)
                      router.refresh()
                    } catch {
                      toast.error('Error de conexión')
                    } finally {
                      setLoading(false)
                    }
                  }}
                >
                  {loading ? 'Guardando...' : 'Guardar modo'}
                </Button>
              </div>
            )}
            {mode === 'perLocation' && mpPerLocationEnabled && (
              <p className="text-[11px] text-muted-foreground/70 bg-muted/30 rounded-xl p-3">
                Seleccioná la cuenta de cada sede en la pestaña <strong>Sedes</strong>, dentro de cada tarjeta.
              </p>
            )}
          </div>
        )}

        {/* ── Accounts List ── */}
        {mpAccounts.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Cuentas configuradas</p>
            {mpAccounts.map(acc => (
              <div key={acc._id} className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                acc.isActive
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-muted/20 border-border/60"
              )}>
                <button
                  onClick={() => !acc.isActive && handleActivate(acc._id)}
                  disabled={loading || acc.isActive}
                  className="shrink-0"
                >
                  <Radio
                    size={18}
                    className={cn(
                      acc.isActive ? "text-emerald-500 fill-emerald-500" : "text-muted-foreground/40",
                      !acc.isActive && "hover:text-primary cursor-pointer"
                    )}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-bold truncate", acc.isActive ? "text-emerald-700" : "text-foreground")}>
                    {acc.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {(() => {
                      // Réplica de isOAuthValid() de lib/mercadopago.ts:76-79
                      const oauthValid = !!acc.oauthIsConnected &&
                        (!acc.oauthExpiresAt || new Date(acc.oauthExpiresAt).getTime() > Date.now())
                      if (oauthValid && acc.hasAccessToken) {
                        return `Cobros vía OAuth (user_id ${acc.oauthMpUserId ?? 'desconocido'})`
                      }
                      if (oauthValid) {
                        return `Cobros vía OAuth (user_id ${acc.oauthMpUserId ?? 'desconocido'}) · sin token manual`
                      }
                      if (acc.hasAccessToken) {
                        return `Cobros vía token manual (user_id ${acc.mpUserId ?? 'desconocido'})`
                      }
                      return 'Sin credenciales de cobro'
                    })()}
                    {acc.isActive && ' · Activa'}
                  </p>
                  {(acc.mpUserId != null || acc.oauthMpUserId != null) && (
                    <p className="text-[10px] text-muted-foreground/50">
                      {acc.mpUserId != null && <>Token manual: MP #{acc.mpUserId}</>}
                      {acc.mpUserId != null && acc.oauthMpUserId != null && ' · '}
                      {acc.oauthMpUserId != null && <>OAuth: MP #{acc.oauthMpUserId}</>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditingAccountId(acc._id)
                    setEditLabel(acc.label)
                    setEditForm({ accessToken: '', publicKey: '', webhookSecret: '' })
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleVerify(acc._id)}
                  disabled={verifyingId !== null}
                  title="Verificar conexión con Mercado Pago"
                  className="text-xs text-muted-foreground hover:text-[#009EE3] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#009EE3]/10 flex items-center gap-1"
                >
                  {verifyingId === acc._id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Stethoscope size={12} />}
                  Verificar
                </button>
                {splitRequired && splitConnected(acc) && (
                  <span className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700" title="Conectada al split de TakeasyGO: la administra TakeasyGO">
                    <Lock size={10} /> Split
                  </span>
                )}
                {!acc.isActive && !(splitRequired && splitConnected(acc)) && (
                  <button
                    onClick={() => handleDelete(acc._id)}
                    disabled={loading}
                    className="text-muted-foreground hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Resultado del diagnóstico (Verificar) ── */}
        {verifyResult && (
          <div className={cn(
            "p-5 rounded-2xl border-2 space-y-2",
            verifyResult.ok
              ? "bg-emerald-500/5 border-emerald-500/20"
              : "bg-red-500/5 border-red-500/20"
          )}>
            <div className="flex items-center gap-2">
              {verifyResult.ok
                ? <CheckCircle2 size={16} className="text-emerald-600" />
                : <AlertCircle size={16} className="text-red-500" />}
              <p className={cn(
                "text-sm font-bold",
                verifyResult.ok ? "text-emerald-800" : "text-red-700"
              )}>
                {verifyResult.ok ? 'Conexión verificada' : 'Verificación fallida'}
                {verifyResult.accountLabel && (
                  <span className="font-medium text-muted-foreground"> · {verifyResult.accountLabel}</span>
                )}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{verifyResult.message}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
              <p>
                Token: <strong className="text-foreground">
                  {verifyResult.tokenSource === 'oauth' ? 'OAuth' : verifyResult.tokenSource === 'manual' ? 'Manual' : '—'}
                </strong>
              </p>
              {verifyResult.user && (
                <p>
                  Titular MP: <strong className="text-foreground">
                    {verifyResult.user.nickname ?? verifyResult.user.email ?? `#${verifyResult.user.id}`}
                  </strong>
                </p>
              )}
              {verifyResult.tokenSource === 'oauth' && (
                <>
                  <p>
                    Vence: <strong className="text-foreground">
                      {verifyResult.oauth.expiresAt
                        ? new Date(verifyResult.oauth.expiresAt).toLocaleDateString('es-AR')
                        : 'sin fecha (legacy)'}
                    </strong>
                  </p>
                  <p>
                    {verifyResult.oauth.status === 'expired' ? (
                      <span className="text-red-500 font-bold">TOKEN VENCIDO — reconectá</span>
                    ) : verifyResult.oauth.status === 'soon' && verifyResult.oauth.daysRemaining != null ? (
                      <span className="text-amber-600 font-bold">Vence en {verifyResult.oauth.daysRemaining} días</span>
                    ) : verifyResult.oauth.status === 'valid' && verifyResult.oauth.daysRemaining != null ? (
                      <span>Vigente — {verifyResult.oauth.daysRemaining} días restantes (TTL {verifyResult.oauth.ttlDays}d)</span>
                    ) : (
                      <span>Sin fecha de vencimiento registrada</span>
                    )}
                  </p>
                  <p>
                    Refresh token: <strong className="text-foreground">
                      {verifyResult.oauth.hasRefreshToken ? 'guardado (renovable)' : 'no guardado'}
                    </strong>
                  </p>
                </>
              )}
            </div>
            {verifyResult.ok && verifyResult.tokenSource === 'oauth' && verifyResult.oauth.status === 'expired' && (
              <p className="text-[11px] text-red-600 font-medium">
                El token venció pero quedó registrado. Usá el botón de reconectar de abajo para volver a autorizar.
              </p>
            )}
            <button
              onClick={() => setVerifyResult(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Cerrar diagnóstico
            </button>
          </div>
        )}

        {/* ── Add Account Button / Form ── */}
        {!showAddForm ? (
          <Button
            variant="outline"
            className="w-full border-2 border-dashed border-border/80 rounded-2xl h-14 text-muted-foreground hover:text-foreground hover:border-primary/40"
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={16} className="mr-2" />
            Agregar nueva cuenta
          </Button>
        ) : (
          <form onSubmit={handleAddAccount} className="space-y-4 p-6 rounded-3xl bg-muted/10 border-2 border-border/60">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Nueva cuenta</p>
            <div className="space-y-2">
              <label className={labelCls}>Nombre de la cuenta</label>
              <input
                required
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Ej: Cuenta Principal, Cuenta Delivery"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={labelCls}><Key size={10} className="inline mr-1" /> Access Token</label>
                <input
                  required
                  type="password"
                  value={newForm.accessToken}
                  onChange={e => setNewForm(p => ({ ...p, accessToken: e.target.value }))}
                  placeholder="APP_USR-782..."
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label className={labelCls}><CheckCircle2 size={10} className="inline mr-1" /> Public Key</label>
                <input
                  required
                  value={newForm.publicKey}
                  onChange={e => setNewForm(p => ({ ...p, publicKey: e.target.value }))}
                  placeholder="APP_USR-291..."
                  className={inputCls}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className={labelCls}><ShieldCheck size={10} className="inline mr-1" /> Webhook Secret</label>
              <input
                required
                type="password"
                value={newForm.webhookSecret}
                onChange={e => setNewForm(p => ({ ...p, webhookSecret: e.target.value }))}
                placeholder="Clave secreta de tu webhook en MP"
                className={inputCls}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="bg-primary text-white rounded-xl px-8">
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear cuenta'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)} className="rounded-xl">
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* ── Edit Account Form ── */}
        {editingAccountId && (
          <form onSubmit={handleEditAccount} className="space-y-4 p-6 rounded-3xl bg-primary/5 border-2 border-primary/20">
            <p className="text-xs font-bold uppercase tracking-widest text-primary/60">Editar cuenta</p>
            <div className="space-y-2">
              <label className={labelCls}>Nombre</label>
              <input
                required
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label className={labelCls}><Key size={10} className="inline mr-1" /> Access Token <span className="text-muted-foreground/40 normal-case tracking-normal">(dejar vacío para no cambiar)</span></label>
              <input
                type="password"
                value={editForm.accessToken}
                onChange={e => setEditForm(p => ({ ...p, accessToken: e.target.value }))}
                placeholder="Dejar vacío si no querés cambiar"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label className={labelCls}><CheckCircle2 size={10} className="inline mr-1" /> Public Key</label>
              <input
                value={editForm.publicKey}
                onChange={e => setEditForm(p => ({ ...p, publicKey: e.target.value }))}
                placeholder="Dejar vacío si no querés cambiar"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label className={labelCls}><ShieldCheck size={10} className="inline mr-1" /> Webhook Secret</label>
              <input
                type="password"
                value={editForm.webhookSecret}
                onChange={e => setEditForm(p => ({ ...p, webhookSecret: e.target.value }))}
                placeholder="Dejar vacío si no querés cambiar"
                className={inputCls}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="bg-primary text-white rounded-xl px-8">
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Guardar cambios'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditingAccountId(null)} className="rounded-xl">
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* ── OAuth Split Payments ── */}
        <div className="border-t border-border/40 pt-8 space-y-3">
          {mpPaused && (
            <div role="alert" className="space-y-1 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
              <p className="flex items-center gap-2 font-bold"><AlertCircle size={16} /> MercadoPago está pausado</p>
              <p>
                La cuenta que cobra no tiene el split de pagos de TakeasyGO conectado (se venció o se quitó el permiso desde MercadoPago).
                Hasta reconectarla, tus clientes no pueden pagar con MercadoPago; sí con efectivo o transferencia.
                Reconectala con el botón de abajo, iniciando sesión con la cuenta de MercadoPago donde cobrás, o pedile el link a TakeasyGO.
              </p>
            </div>
          )}
          {splitRequired && activeSplitOk ? (
            <div className="space-y-1 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="flex items-center gap-2 font-bold"><ShieldCheck size={16} /> Split de pagos conectado · administrado por TakeasyGO</p>
              <p>
                Cada cobro con MercadoPago entra a tu cuenta y MercadoPago descuenta sola la comisión de TakeasyGO.
                La conexión la administra TakeasyGO: no hace falta que hagas nada. Si necesitás cambiar la cuenta de cobro, escribinos.
              </p>
            </div>
          ) : (
            <MpOAuthConnectButton
              tenantSlug={tenantSlug}
              isConnected={mpOAuth?.isConnected ?? false}
              authorizedAt={mpOAuth?.authorizedAt}
            />
          )}
          <button
            onClick={() => handleVerify('legacy')}
            disabled={verifyingId !== null}
            title="Verificar la conexión OAuth con Mercado Pago (incluye vencimiento del token)"
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-border/60 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-[#009EE3]/40 transition-all disabled:opacity-60"
          >
            {verifyingId === 'legacy'
              ? <><Loader2 size={14} className="animate-spin" /> Verificando…</>
              : <><Stethoscope size={14} /> Verificar conexión OAuth</>}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
