'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

// Multi-marca PR 9b — /grupo/aceptar?token=… (link del email de invitación).
// Muestra la organización y deja: aceptar con la sesión actual, iniciar sesión
// y volver, o crear la cuenta (si el email no tiene una). El servidor exige que
// el email de la cuenta sea el invitado.

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario',
  org_admin: 'Administrador general',
  brand_manager: 'Gerente de marca',
  location_manager: 'Gerente de sede',
  operations: 'Encargado operativo',
  accountant: 'Contador',
}

interface Preview {
  organization: { name: string; slug: string }
  orgRole: string
  emailHint: string
  accountExists: boolean
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: Preview }
  | { kind: 'done'; orgName: string }

export default function AceptarInvitacionPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') ?? ''
    setToken(t)
    if (!t) {
      setState({ kind: 'error', message: 'El enlace no es válido.' })
      return
    }
    fetch(`/api/grupo/invitations?token=${encodeURIComponent(t)}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) setState({ kind: 'error', message: data.error ?? 'No pudimos abrir la invitación.' })
        else setState({ kind: 'ready', preview: data as Preview })
      })
      .catch(() => setState({ kind: 'error', message: 'No pudimos abrir la invitación. Revisá tu conexión.' }))
  }, [])

  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/grupo/aceptar?token=${token}`)}`

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    setFormError('')
    try {
      const r = await fetch('/api/grupo/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, ...body }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok && state.kind === 'ready') {
        setState({ kind: 'done', orgName: state.preview.organization.name })
        return
      }
      if (r.status === 401) setNeedsLogin(true)
      setFormError(data.error ?? 'No pudimos completar la operación.')
    } catch {
      setFormError('No pudimos completar la operación. Revisá tu conexión.')
    } finally {
      setBusy(false)
    }
  }

  function onRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const name = (form.elements.namedItem('name') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value
    if (password !== confirm) {
      setFormError('Las contraseñas no coinciden.')
      return
    }
    void post({ action: 'register', name, password })
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="text-primary" size={26} />
          <h1 className="text-xl font-semibold text-foreground">Invitación a una organización</h1>
        </div>

        {state.kind === 'loading' && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="animate-spin" size={16} /> Cargando…
          </div>
        )}

        {state.kind === 'error' && (
          <div className="flex gap-2 text-sm text-destructive">
            <AlertCircle size={18} className="shrink-0" /> <p>{state.message}</p>
          </div>
        )}

        {state.kind === 'done' && (
          <div className="space-y-4">
            <div className="flex gap-2 text-sm text-foreground">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <p>Listo: ya sos parte de <strong>{state.orgName}</strong>.</p>
            </div>
            <button
              onClick={() => router.push(needsLogin ? loginHref : '/grupo')}
              className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-semibold"
            >
              Ir a mis organizaciones
            </button>
            <p className="text-xs text-muted-foreground">Si todavía no iniciaste sesión, te la va a pedir.</p>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="space-y-5">
            <p className="text-sm text-foreground leading-relaxed">
              Te invitaron a <strong>{state.preview.organization.name}</strong> como{' '}
              <strong>{ROLE_LABEL[state.preview.orgRole] ?? state.preview.orgRole}</strong>. La invitación es para{' '}
              <strong>{state.preview.emailHint}</strong>.
            </p>

            {state.preview.accountExists ? (
              <div className="space-y-3">
                <button
                  disabled={busy}
                  onClick={() => void post({ action: 'accept' })}
                  className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {busy ? 'Aceptando…' : 'Aceptar invitación'}
                </button>
                <p className="text-xs text-muted-foreground">
                  Tenés que estar con la sesión del email invitado.{' '}
                  <Link href={loginHref} className="text-primary underline">Iniciar sesión</Link>
                </p>
              </div>
            ) : (
              <form onSubmit={onRegister} className="space-y-3">
                <p className="text-xs text-muted-foreground">Ese email no tiene cuenta: creala para aceptar.</p>
                <input name="name" required minLength={2} maxLength={100} placeholder="Tu nombre" autoComplete="name"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                <input name="password" type="password" required minLength={8} placeholder="Contraseña (mínimo 8)" autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                <input name="confirm" type="password" required minLength={8} placeholder="Repetí la contraseña" autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {busy ? 'Creando…' : 'Crear cuenta y aceptar'}
                </button>
              </form>
            )}

            {formError && (
              <div className="flex gap-2 text-sm text-destructive">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>
                  {formError}{' '}
                  {needsLogin && <Link href={loginHref} className="underline">Iniciar sesión</Link>}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
