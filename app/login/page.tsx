'use client'

import { signIn, getSession } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function LoginPage() {
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
            const tenantSlug = session?.user?.tenantSlug

            if (role === 'superadmin') {
                router.push('/superadmin')
            } else if (tenantSlug) {
                router.push(`/${tenantSlug}/admin`)
            } else {
                router.push('/superadmin')
            }
        }
    }

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

                .login-root {
                    min-height: 100dvh;
                    background: #f7f4f1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 24px 20px;
                    font-family: 'DM Sans', sans-serif;
                }

                .login-card {
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

                /* ── Header ── */
                .login-logo {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 36px;
                }

                .login-logo-mark {
                    width: 32px;
                    height: 32px;
                    background: #0d0b0a;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .login-logo-mark span {
                    color: #ffffff;
                    font-family: 'DM Serif Display', serif;
                    font-style: italic;
                    font-size: 18px;
                    line-height: 1;
                }

                .login-logo-name {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 16px;
                    font-weight: 600;
                    color: #0d0b0a;
                    letter-spacing: -0.01em;
                }

                .login-eyebrow {
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

                .login-eyebrow-dot {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    background: #f14722;
                    flex-shrink: 0;
                }

                .login-title {
                    font-family: 'DM Serif Display', serif;
                    font-size: 30px;
                    font-weight: 400;
                    line-height: 1.1;
                    letter-spacing: -0.02em;
                    color: #0d0b0a;
                    margin-bottom: 6px;
                }

                .login-subtitle {
                    font-size: 13px;
                    font-weight: 300;
                    color: #6b6460;
                    line-height: 1.5;
                    margin-bottom: 36px;
                }

                /* ── Form fields ── */
                .login-field {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 28px;
                }

                .login-label {
                    font-size: 9px;
                    font-weight: 600;
                    letter-spacing: 0.22em;
                    text-transform: uppercase;
                    color: #6b6460;
                }

                .login-input-wrap {
                    position: relative;
                }

                .login-input {
                    width: 100%;
                    background: transparent;
                    border: none;
                    border-bottom: 2px solid #e2deda;
                    padding: 10px 0;
                    font-family: 'DM Sans', sans-serif;
                    font-size: 15px;
                    font-weight: 400;
                    color: #0d0b0a;
                    transition: border-color 0.2s;
                    outline: none;
                }

                .login-input::placeholder {
                    color: #b0aaa6;
                }

                .login-input:focus {
                    border-bottom-color: #0d0b0a;
                }

                .login-input.has-toggle {
                    padding-right: 36px;
                }

                .login-toggle-btn {
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

                .login-toggle-btn:hover {
                    color: #0d0b0a;
                }

                /* ── Error ── */
                .login-error {
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

                /* ── Submit ── */
                .login-submit {
                    width: 100%;
                    background: #0d0b0a;
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
                    transition: background 0.2s;
                    margin-top: 8px;
                }

                .login-submit:hover:not(:disabled) {
                    background: #f14722;
                }

                .login-submit:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                /* ── Divider ── */
                .login-divider {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin: 32px 0 28px;
                }

                .login-divider-line {
                    flex: 1;
                    height: 1px;
                    background: #ede9e5;
                }

                .login-divider-text {
                    font-size: 9px;
                    font-weight: 500;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: #b0aaa6;
                    white-space: nowrap;
                }

                /* ── Demo CTA ── */
                .login-demo-block {
                    text-align: center;
                }

                .login-demo-label {
                    font-size: 12px;
                    font-weight: 300;
                    color: #8a8280;
                    margin-bottom: 10px;
                }

                .login-demo-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: #0d0b0a;
                    text-decoration: none;
                    transition: color 0.2s;
                }

                .login-demo-link:hover {
                    color: #f14722;
                }

                /* ── Back link ── */
                .login-back {
                    margin-top: 28px;
                    font-size: 11px;
                    font-weight: 400;
                    color: #b0aaa6;
                    text-align: center;
                    display: block;
                }

                .login-back a {
                    color: #8a8280;
                    text-decoration: none;
                    transition: color 0.2s;
                }

                .login-back a:hover {
                    color: #0d0b0a;
                }

                @media (max-width: 480px) {
                    .login-card {
                        padding: 36px 28px 32px;
                        border-radius: 22px;
                    }
                    .login-title { font-size: 26px; }
                }
            `}</style>

            <div className="login-root">
                <div className="login-card">

                    {/* Logo */}
                    <div className="login-logo">
                        <div className="login-logo-mark">
                            <span>T</span>
                        </div>
                        <span className="login-logo-name">Takeasygo</span>
                    </div>

                    {/* Header */}
                    <div className="login-eyebrow">
                        <span className="login-eyebrow-dot" />
                        Acceso exclusivo para clientes
                    </div>
                    <h1 className="login-title">Bienvenido<em style={{ fontStyle: 'italic', color: '#8a8280' }}>.</em></h1>
                    <p className="login-subtitle">
                        Ingresá a tu panel de gestión con las credenciales de tu cuenta registrada.
                    </p>

                    {/* Form */}
                    <form onSubmit={handleSubmit} noValidate>

                        {/* Email */}
                        <div className="login-field">
                            <label htmlFor="login-email" className="login-label">Email</label>
                            <div className="login-input-wrap">
                                <input
                                    id="login-email"
                                    name="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    placeholder="tu@email.com"
                                    className="login-input"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="login-field">
                            <label htmlFor="login-password" className="login-label">Contraseña</label>
                            <div className="login-input-wrap">
                                <input
                                    id="login-password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className="login-input has-toggle"
                                />
                                <button
                                    type="button"
                                    className="login-toggle-btn"
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

                        {/* Error */}
                        {error && (
                            <div className="login-error" role="alert">{error}</div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="login-submit"
                        >
                            {loading ? 'Ingresando…' : 'Ingresar al panel'}
                        </button>

                    </form>

                    {/* Demo CTA */}
                    <div className="login-divider">
                        <span className="login-divider-line" />
                        <span className="login-divider-text">¿No eres cliente?</span>
                        <span className="login-divider-line" />
                    </div>

                    <div className="login-demo-block">
                        <p className="login-demo-label">
                            Conocé cómo Takeasygo puede transformar tu restaurante.
                        </p>
                        <Link href="/#demo" className="login-demo-link">
                            Solicitar una demo
                            <ArrowRight size={13} strokeWidth={2} />
                        </Link>
                    </div>

                </div>

                {/* Back to landing */}
                <span className="login-back">
                    <Link href="/">← Volver al inicio</Link>
                </span>
            </div>
        </>
    )
}
