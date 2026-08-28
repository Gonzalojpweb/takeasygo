'use client'

import { signIn, getSession } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  tenantSlug: string
  tenantName: string
  primaryColor: string
  bgColor: string
  textColor: string
  logoUrl: string | null
}

export default function AdminLoginForm({
  tenantSlug,
  tenantName,
  primaryColor,
  bgColor,
  textColor,
  logoUrl,
}: Props) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      const session = await getSession()
      const role = session?.user?.role
      const userTenantSlug = session?.user?.tenantSlug

      if (role === 'superadmin') {
        router.push('/superadmin')
      } else if (role === 'seller') {
        router.push('/seller')
      } else if (userTenantSlug) {
        router.push(`/${userTenantSlug}/admin`)
      } else {
        router.push('/superadmin')
      }
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

        .admin-login-root {
          min-height: 100dvh;
          background: ${bgColor};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 20px;
          font-family: 'DM Sans', sans-serif;
        }

        .admin-login-card {
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border: 1px solid rgba(13,11,10,0.07);
          border-radius: 28px;
          padding: 48px 44px 40px;
          box-shadow:
            0 1px 2px rgba(13,11,10,0.03),
            0 20px 60px rgba(13,11,10,0.08);
        }

        .admin-login-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 36px;
        }

        .admin-login-logo-img {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          object-fit: contain;
          background: ${bgColor};
        }

        .admin-login-logo-mark {
          width: 40px;
          height: 40px;
          background: ${primaryColor};
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .admin-login-logo-mark span {
          color: #ffffff;
          font-family: 'DM Serif Display', serif;
          font-style: italic;
          font-size: 20px;
          line-height: 1;
        }

        .admin-login-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #8a8280;
          margin-bottom: 12px;
        }

        .admin-login-eyebrow-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: ${primaryColor};
          flex-shrink: 0;
        }

        .admin-login-title {
          font-family: 'DM Serif Display', serif;
          font-size: 28px;
          font-weight: 400;
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: ${textColor};
          margin-bottom: 6px;
        }

        .admin-login-subtitle {
          font-size: 13px;
          font-weight: 300;
          color: #6b6460;
          line-height: 1.5;
          margin-bottom: 36px;
        }

        .admin-login-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 28px;
        }

        .admin-login-label {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #6b6460;
        }

        .admin-login-input-wrap {
          position: relative;
        }

        .admin-login-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 2px solid #e2deda;
          padding: 10px 0;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 400;
          color: ${textColor};
          transition: border-color 0.2s;
          outline: none;
        }

        .admin-login-input::placeholder {
          color: #b0aaa6;
        }

        .admin-login-input:focus {
          border-bottom-color: ${primaryColor};
        }

        .admin-login-input.has-toggle {
          padding-right: 36px;
        }

        .admin-login-toggle-btn {
          position: absolute;
          right: 0;
          bottom: 10px;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: #b0aaa6;
          display: flex;
          align-items: center;
          transition: color 0.2s;
          line-height: 0;
        }

        .admin-login-toggle-btn:hover {
          color: ${textColor};
        }

        .admin-login-error {
          font-size: 12px;
          font-weight: 500;
          color: #c0392b;
          background: rgba(192,57,43,0.06);
          border: 1px solid rgba(192,57,43,0.15);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 24px;
          text-align: center;
        }

        .admin-login-submit {
          width: 100%;
          background: ${primaryColor};
          color: #ffffff;
          font-family: 'DM Sans', sans-serif;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border: none;
          border-radius: 100px;
          height: 52px;
          cursor: pointer;
          transition: opacity 0.2s;
          margin-top: 8px;
        }

        .admin-login-submit:hover:not(:disabled) {
          opacity: 0.9;
        }

        .admin-login-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .admin-login-forgot {
          text-align: right;
          margin-top: -16px;
          margin-bottom: 16px;
        }

        .admin-login-forgot a {
          font-size: 11px;
          color: #8a8280;
          text-decoration: none;
        }

        .admin-login-forgot a:hover {
          color: ${primaryColor};
        }

        .admin-login-footer {
          margin-top: 28px;
          font-size: 11px;
          font-weight: 400;
          color: #b0aaa6;
          text-align: center;
        }

        .admin-login-footer a {
          color: #8a8280;
          text-decoration: none;
          transition: color 0.2s;
        }

        .admin-login-footer a:hover {
          color: ${textColor};
        }

        @media (max-width: 480px) {
          .admin-login-card {
            padding: 36px 28px 32px;
            border-radius: 22px;
          }
          .admin-login-title { font-size: 24px; }
        }
      `}</style>

      <div className="admin-login-root">
        <div className="admin-login-card">

          {/* Logo */}
          <div className="admin-login-logo">
            {logoUrl ? (
              <img src={logoUrl} alt={tenantName} className="admin-login-logo-img" />
            ) : (
              <div className="admin-login-logo-mark">
                <span>{tenantName.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>

          {/* Header */}
          <div className="admin-login-eyebrow">
            <span className="admin-login-eyebrow-dot" />
            Panel de administración
          </div>
          <h1 className="admin-login-title">{tenantName}</h1>
          <p className="admin-login-subtitle">
            Ingresá con las credenciales de tu cuenta para administrar tu restaurante.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>

            {/* Email */}
            <div className="admin-login-field">
              <label htmlFor="admin-login-email" className="admin-login-label">Email</label>
              <div className="admin-login-input-wrap">
                <input
                  id="admin-login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="tu@email.com"
                  className="admin-login-input"
                />
              </div>
            </div>

            {/* Password */}
            <div className="admin-login-field">
              <label htmlFor="admin-login-password" className="admin-login-label">Contraseña</label>
              <div className="admin-login-input-wrap">
                <input
                  id="admin-login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="admin-login-input has-toggle"
                />
                <button
                  type="button"
                  className="admin-login-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword
                    ? <EyeOff size={16} strokeWidth={1.5} />
                    : <Eye size={16} strokeWidth={1.5} />
                  }
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="admin-login-forgot">
              <a href="/forgot-password">¿Olvidaste tu contraseña?</a>
            </div>

            {/* Error */}
            {error && (
              <div className="admin-login-error" role="alert">{error}</div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="admin-login-submit"
            >
              {loading ? 'Ingresando…' : 'Ingresar al panel'}
            </button>

          </form>

        </div>

        {/* Footer */}
        <span className="admin-login-footer">
          <a href="/">← Volver al inicio</a>
        </span>
      </div>
    </>
  )
}
