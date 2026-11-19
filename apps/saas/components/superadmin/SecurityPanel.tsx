'use client'

import { useCallback, useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { KeyRound, ShieldCheck, ShieldAlert, LogOut, RefreshCw, Copy, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Seguridad de la cuenta SuperAdmin (19/11/2026):
 *  - Activar MFA (app autenticadora gratuita) + 10 códigos de recuperación.
 *  - Regenerar códigos, cambiar contraseña (contraseña + código).
 *  - Cerrar todas las sesiones.
 *  - Últimos eventos de la auditoría de sistema.
 */

interface SecurityEvent {
  _id: string
  action: string
  userName?: string
  ip?: string
  userAgent?: string
  details?: Record<string, unknown>
  createdAt: string
}

interface SecurityStatus {
  email: string | null
  mfaEnabled: boolean
  mfaEnabledAt: string | null
  recoveryCodesLeft: number
  lastLoginAt: string | null
  secondChannelConfigured: boolean
  events: SecurityEvent[]
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.logout': 'Cierre de sesión',
  'security.superadmin_login_failed': 'Contraseña incorrecta',
  'security.superadmin_mfa_failed': 'Código MFA incorrecto',
  'security.superadmin_recovery_code_used': 'Entró con código de recuperación',
  'security.superadmin_provider_blocked': 'Intento por Google / link de email (bloqueado)',
  'security.superadmin_reset_blocked': 'Pedido de reset por email (bloqueado)',
  'security.superadmin_reauth_failed': 'Reautenticación fallida',
  'security.superadmin_mfa_setup_started': 'Inició activación de MFA',
  'security.superadmin_mfa_enabled': 'MFA activado',
  'security.superadmin_recovery_codes_regenerated': 'Códigos de recuperación regenerados',
  'security.superadmin_password_changed': 'Contraseña cambiada',
  'security.superadmin_sessions_revoked': 'Se cerraron todas las sesiones',
  'security.offline_recovery': 'Recuperación offline (script)',
}

async function postJson(url: string, body: unknown = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'No se pudo completar la acción.')
  return data
}

function RecoveryCodesBox({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  const [saved, setSaved] = useState(false)
  const text = codes.join('\n')
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Códigos de recuperación</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Se muestran <strong>una sola vez</strong>. Imprimilos o anotalos en papel y guardalos fuera de la computadora
          y del celular. Cada código sirve para entrar <strong>una vez</strong> si perdés el celular.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <div key={c} className="rounded-lg bg-background border border-border px-3 py-2 text-center tracking-wider">{c}</div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(text).then(() => toast.success('Copiados')).catch(() => {}) }}>
          <Copy className="w-4 h-4 mr-2" /> Copiar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>Imprimir</Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Ya los guardé en un lugar seguro
      </label>
      <Button type="button" disabled={!saved} onClick={onDone}>{doneLabel}</Button>
    </div>
  )
}

export default function SecurityPanel() {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)

  // Enrolamiento
  const [setupPassword, setSetupPassword] = useState('')
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [enableCode, setEnableCode] = useState('')
  const [newCodes, setNewCodes] = useState<string[] | null>(null)
  const [codesAfterEnable, setCodesAfterEnable] = useState(false)

  // Regenerar / contraseña
  const [rcPassword, setRcPassword] = useState('')
  const [rcCode, setRcCode] = useState('')
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwCode, setPwCode] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwNew2, setPwNew2] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/security', { cache: 'no-store' })
      if (res.status === 403) {
        setLoadError('Tu sesión ya no es válida. Volvé a iniciar sesión.')
        return
      }
      const data = await res.json()
      setStatus(data)
    } catch {
      setLoadError('No se pudo cargar el estado de seguridad.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function startSetup(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const data = await postJson('/api/superadmin/security/mfa/setup', { password: setupPassword })
      setSetup(data)
      setSetupPassword('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setBusy(false) }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const data = await postJson('/api/superadmin/security/mfa/enable', { code: enableCode })
      setNewCodes(data.recoveryCodes)
      setCodesAfterEnable(true)
      setSetup(null)
      setEnableCode('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setBusy(false) }
  }

  async function regenerateCodes(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const data = await postJson('/api/superadmin/security/recovery-codes', { password: rcPassword, code: rcCode })
      setNewCodes(data.recoveryCodes)
      setCodesAfterEnable(false)
      setRcPassword(''); setRcCode('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setBusy(false) }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwNew !== pwNew2) { toast.error('Las contraseñas nuevas no coinciden.'); return }
    setBusy(true)
    try {
      await postJson('/api/superadmin/security/password', { currentPassword: pwCurrent, code: pwCode, newPassword: pwNew })
      toast.success('Contraseña cambiada. Se cerraron todas las sesiones.')
      await signOut({ callbackUrl: '/login' })
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setBusy(false) }
  }

  async function revokeSessions() {
    if (!window.confirm('¿Cerrar TODAS las sesiones de esta cuenta, incluida esta?')) return
    setBusy(true)
    try {
      await postJson('/api/superadmin/security/sessions')
      await signOut({ callbackUrl: '/login' })
    } catch (err) {
      toast.error((err as Error).message)
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-border p-6 space-y-4">
        <p className="text-sm">{loadError}</p>
        <Button onClick={() => signOut({ callbackUrl: '/login' })}>Ir al login</Button>
      </div>
    )
  }
  if (!status) return <p className="text-sm text-muted-foreground">Cargando…</p>

  // Códigos recién generados: pantalla única hasta confirmar que se guardaron.
  if (newCodes) {
    return (
      <div className="space-y-6">
        <Header status={status} />
        <RecoveryCodesBox
          codes={newCodes}
          doneLabel={codesAfterEnable ? 'Volver a entrar con el código' : 'Listo'}
          onDone={() => {
            setNewCodes(null)
            if (codesAfterEnable) signOut({ callbackUrl: '/login' })
            else load()
          }}
        />
        {codesAfterEnable && (
          <p className="text-sm text-muted-foreground">
            Al activar MFA se cerraron todas las sesiones. Entrá de nuevo con tu contraseña y el código de la app.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Header status={status} />

      {!status.mfaEnabled && (
        <section className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold">Activá la verificación en dos pasos</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Es obligatoria para la cuenta SuperAdmin. Hasta activarla no podés usar el panel.
                Necesitás una app autenticadora gratuita en el celular (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).
              </p>
            </div>
          </div>

          {!setup ? (
            <form onSubmit={startSetup} className="space-y-3 max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="setup-password">Tu contraseña actual</Label>
                <Input id="setup-password" type="password" autoComplete="current-password" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} required />
              </div>
              <Button type="submit" disabled={busy || !setupPassword}>Empezar</Button>
            </form>
          ) : (
            <form onSubmit={confirmEnable} className="space-y-4">
              <ol className="text-sm space-y-1 list-decimal pl-5">
                <li>Abrí la app autenticadora y escaneá este QR.</li>
                <li>Escribí el código de 6 dígitos que muestra la app.</li>
              </ol>
              <div className="bg-white p-4 rounded-xl inline-block">
                <QRCodeSVG value={setup.uri} size={192} />
              </div>
              <div className="text-xs text-muted-foreground">
                ¿No podés escanear? Clave manual: <code className="font-mono break-all select-all">{setup.secret}</code>
              </div>
              <div className="space-y-1.5 max-w-[200px]">
                <Label htmlFor="enable-code">Código de 6 dígitos</Label>
                <Input id="enable-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={enableCode} onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ''))} required />
              </div>
              <Button type="submit" disabled={busy || enableCode.length !== 6}>Activar MFA</Button>
            </form>
          )}
        </section>
      )}

      {status.mfaEnabled && (
        <>
          <section className="rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4" /><h2 className="font-semibold">Códigos de recuperación</h2></div>
            <p className="text-sm text-muted-foreground">
              Te quedan <strong>{status.recoveryCodesLeft}</strong> de 10. Si generás nuevos, los anteriores dejan de servir.
            </p>
            <form onSubmit={regenerateCodes} className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="rc-password">Contraseña</Label>
                <Input id="rc-password" type="password" autoComplete="current-password" value={rcPassword} onChange={(e) => setRcPassword(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rc-code">Código de la app</Label>
                <Input id="rc-code" inputMode="numeric" maxLength={6} value={rcCode} onChange={(e) => setRcCode(e.target.value.replace(/\D/g, ''))} required />
              </div>
              <Button type="submit" variant="outline" disabled={busy}>Generar nuevos</Button>
            </form>
          </section>

          <section className="rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2"><Lock className="w-4 h-4" /><h2 className="font-semibold">Cambiar contraseña</h2></div>
            <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pw-current">Contraseña actual</Label>
                <Input id="pw-current" type="password" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-code">Código de la app</Label>
                <Input id="pw-code" inputMode="numeric" maxLength={6} value={pwCode} onChange={(e) => setPwCode(e.target.value.replace(/\D/g, ''))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-new">Contraseña nueva (mín. 12)</Label>
                <Input id="pw-new" type="password" autoComplete="new-password" minLength={12} value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-new2">Repetir contraseña nueva</Label>
                <Input id="pw-new2" type="password" autoComplete="new-password" minLength={12} value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>Cambiar contraseña</Button>
              </div>
            </form>
          </section>
        </>
      )}

      <section className="rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-center gap-2"><LogOut className="w-4 h-4" /><h2 className="font-semibold">Cerrar todas las sesiones</h2></div>
        <p className="text-sm text-muted-foreground">Si sospechás que alguien más entró a la cuenta: corta todas las sesiones abiertas, incluida esta.</p>
        <Button variant="destructive" onClick={revokeSessions} disabled={busy}>Cerrar todas las sesiones</Button>
      </section>

      {status.mfaEnabled && (
        <section className="rounded-2xl border border-border p-5 space-y-3">
          <h2 className="font-semibold">Auditoría de sistema (últimos 50)</h2>
          {status.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-4 font-medium">Fecha</th>
                    <th className="py-2 pr-4 font-medium">Evento</th>
                    <th className="py-2 pr-4 font-medium">Quién</th>
                    <th className="py-2 pr-4 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {status.events.map((ev) => (
                    <tr key={ev._id} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(ev.createdAt).toLocaleString('es-AR')}</td>
                      <td className="py-2 pr-4">{ACTION_LABELS[ev.action] ?? ev.action}</td>
                      <td className="py-2 pr-4">{ev.userName || '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{ev.ip || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Header({ status }: { status: SecurityStatus }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <KeyRound className="w-6 h-6" />
        <h1 className="text-2xl font-semibold">Seguridad de la cuenta</h1>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-border px-3 py-1">{status.email ?? '—'}</span>
        {status.mfaEnabled ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> MFA activo
          </span>
        ) : (
          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 inline-flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-600" /> Sin MFA
          </span>
        )}
        <span className="rounded-full border border-border px-3 py-1">
          Segundo canal de avisos: {status.secondChannelConfigured ? 'configurado' : 'no configurado'}
        </span>
      </div>
    </div>
  )
}
