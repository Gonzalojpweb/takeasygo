'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const password = (e.currentTarget.elements.namedItem('password') as HTMLInputElement).value

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'El enlace es inválido o ya expiró.')
      } else {
        setSuccess(true)
        setTimeout(() => router.push('/login'), 3000)
      }
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <XCircle size={40} style={{ color: '#ef4444', margin: '0 auto 16px' }} />
        <h2 className="login-title" style={{ fontSize: '22px', marginBottom: '12px' }}>
          Enlace inválido
        </h2>
        <p className="login-subtitle" style={{ marginBottom: 0 }}>
          Este enlace de recuperación no es válido.<br />Solicitá uno nuevo desde el inicio de sesión.
        </p>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <CheckCircle2 size={40} style={{ color: '#22c55e', margin: '0 auto 16px' }} />
        <h2 className="login-title" style={{ fontSize: '22px', marginBottom: '12px' }}>
          ¡Contraseña actualizada!
        </h2>
        <p className="login-subtitle" style={{ marginBottom: 0 }}>
          Tu contraseña fue restablecida correctamente.<br />Serás redirigido al inicio de sesión en unos segundos.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="login-eyebrow">
        <span className="login-eyebrow-dot" />
        Nueva contraseña
      </div>
      <h1 className="login-title">Restablecé tu contraseña</h1>
      <p className="login-subtitle">
        Ingresá tu nueva contraseña. Debe tener al menos 8 caracteres.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="login-field">
          <label htmlFor="rp-password" className="login-label">Nueva contraseña</label>
          <div className="login-input-wrap">
            <input
              id="rp-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              className="login-input has-toggle"
            />
            <button
              type="button"
              className="login-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
            >
              {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={loading} className="login-submit">
          {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
        .login-root{min-height:100dvh;background:#f7f4f1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;font-family:'DM Sans',sans-serif;}
        .login-card{width:100%;max-width:420px;background:#ffffff;border:1px solid rgba(13,11,10,0.07);border-radius:28px;padding:48px 44px 40px;box-shadow:0 1px 2px rgba(13,11,10,0.03),0 20px 60px rgba(13,11,10,0.08);}
        .login-logo{display:flex;align-items:center;gap:10px;margin-bottom:36px;}
        .login-logo-mark{width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .login-logo-mark span{color:#fff;font-family:'DM Serif Display',serif;font-style:italic;font-size:18px;line-height:1;}
        .login-logo-name{font-size:16px;font-weight:600;color:#0d0b0a;letter-spacing:-0.01em;}
        .login-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:9px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:#8a8280;margin-bottom:12px;}
        .login-eyebrow-dot{width:5px;height:5px;border-radius:50%;background:#f14722;flex-shrink:0;}
        .login-title{font-family:'DM Serif Display',serif;font-size:28px;font-weight:400;line-height:1.1;letter-spacing:-0.02em;color:#0d0b0a;margin-bottom:6px;}
        .login-subtitle{font-size:13px;font-weight:300;color:#6b6460;line-height:1.5;margin-bottom:32px;}
        .login-field{display:flex;flex-direction:column;gap:8px;margin-bottom:24px;}
        .login-label{font-size:9px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#6b6460;}
        .login-input-wrap{position:relative;}
        .login-input{width:100%;background:transparent;border:none;border-bottom:2px solid #e2deda;padding:10px 0;font-family:'DM Sans',sans-serif;font-size:15px;color:#0d0b0a;transition:border-color 0.2s;outline:none;}
        .login-input::placeholder{color:#b0aaa6;}
        .login-input:focus{border-bottom-color:#0d0b0a;}
        .login-input.has-toggle{padding-right:36px;}
        .login-toggle-btn{position:absolute;right:0;bottom:10px;background:none;border:none;padding:0;cursor:pointer;color:#b0aaa6;display:flex;align-items:center;transition:color 0.2s;line-height:0;}
        .login-toggle-btn:hover{color:#0d0b0a;}
        .login-error{font-size:12px;font-weight:500;color:#c0392b;background:rgba(192,57,43,0.06);border:1px solid rgba(192,57,43,0.15);border-radius:10px;padding:10px 14px;margin-bottom:20px;text-align:center;}
        .login-submit{width:100%;background:#0d0b0a;color:#fff;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;border:none;border-radius:100px;height:52px;cursor:pointer;transition:background 0.2s;margin-top:4px;}
        .login-submit:hover:not(:disabled){background:#f14722;}
        .login-submit:disabled{opacity:0.5;cursor:not-allowed;}
        .login-back{margin-top:28px;font-size:11px;color:#b0aaa6;text-align:center;display:block;}
        .login-back a{color:#8a8280;text-decoration:none;transition:color 0.2s;}
        .login-back a:hover{color:#0d0b0a;}
        @media(max-width:480px){.login-card{padding:36px 28px 32px;border-radius:22px;}.login-title{font-size:24px;}}
      `}</style>

      <div className="login-root">
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-mark"><span>T</span></div>
            <span className="login-logo-name">Takeasygo</span>
          </div>

          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>

        <span className="login-back">
          <Link href="/login">← Volver al inicio de sesión</Link>
        </span>
      </div>
    </>
  )
}
