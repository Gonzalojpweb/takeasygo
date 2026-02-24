'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowRight, CheckCircle2 } from 'lucide-react'

interface PlanLeadModalProps {
    plan: string      // display label, e.g. "Crecimiento – $50/mes"
    planId: string    // internal key
    onClose: () => void
}

type FormState = 'idle' | 'loading' | 'success' | 'error'

export default function PlanLeadModal({ plan, planId, onClose }: PlanLeadModalProps) {
    const [form, setForm] = useState({ name: '', business: '', email: '', phone: '' })
    const [state, setState] = useState<FormState>('idle')
    const [errorMsg, setErrorMsg] = useState('')
    const [mounted, setMounted] = useState(false)
    const firstInputRef = useRef<HTMLInputElement>(null)

    // Only render portal on client
    useEffect(() => { setMounted(true) }, [])

    // Focus first input on mount
    useEffect(() => {
        const t = setTimeout(() => firstInputRef.current?.focus(), 100)
        return () => clearTimeout(t)
    }, [])

    // Auto-close 3.2s after success
    useEffect(() => {
        if (state !== 'success') return
        const t = setTimeout(onClose, 3200)
        return () => clearTimeout(t)
    }, [state, onClose])

    // Close on Escape, lock body scroll while open
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => {
            document.body.style.overflow = prev
            window.removeEventListener('keydown', onKey)
        }
    }, [onClose])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setState('loading')
        setErrorMsg('')

        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, plan, planId }),
            })
            const data = await res.json()
            if (!res.ok) {
                setErrorMsg(data.error || 'Error al enviar. Intentá de nuevo.')
                setState('error')
                return
            }
            setState('success')
        } catch {
            setErrorMsg('Error de conexión. Intentá de nuevo.')
            setState('error')
        }
    }

    const field = (
        id: keyof typeof form,
        label: string,
        type: string,
        placeholder: string,
        ref?: React.RefObject<HTMLInputElement>
    ) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
                htmlFor={`plm-${id}`}
                style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: '#8a8280',
                }}
            >
                {label}
            </label>
            <input
                ref={ref}
                id={`plm-${id}`}
                type={type}
                placeholder={placeholder}
                autoComplete={id === 'email' ? 'email' : id === 'phone' ? 'tel' : 'on'}
                required
                value={form[id]}
                onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
                disabled={state === 'loading'}
                style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1.5px solid rgba(13,11,10,0.12)',
                    padding: '10px 0',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14, fontWeight: 400,
                    color: '#0d0b0a',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    width: '100%',
                }}
                onFocus={e => { e.currentTarget.style.borderBottomColor = '#f14722' }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = 'rgba(13,11,10,0.12)' }}
            />
        </div>
    )

    if (!mounted) return null

    const content = (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

                /* Backdrop fade in */
                @keyframes plm-backdrop-in {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                .plm-backdrop { animation: plm-backdrop-in 0.2s ease both; }

                /*
                 * Card slides up — NO translate(-50%,-50%) here.
                 * Centering is handled by the flex wrapper below,
                 * so the animation can use translateY freely without conflict.
                 */
                @keyframes plm-card-in {
                    from { opacity: 0; transform: translateY(28px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0)     scale(1);   }
                }
                .plm-card { animation: plm-card-in 0.38s cubic-bezier(0.22,1,0.36,1) both; }

                .plm-input::placeholder { color: rgba(13,11,10,0.25); }

                @media (max-width: 480px) {
                    .plm-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>

            {/* ── Backdrop ── */}
            <div
                className="plm-backdrop"
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9000,
                    background: 'rgba(13,11,10,0.58)',
                    backdropFilter: 'blur(7px)',
                    WebkitBackdropFilter: 'blur(7px)',
                }}
            />

            {/*
             * ── Centering wrapper ──
             * position:fixed + flex centering here.
             * pointerEvents:none so clicks outside pass through to the backdrop.
             * The card re-enables pointer events.
             */}
            <div
                style={{
                    position: 'fixed', inset: 0, zIndex: 9001,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    pointerEvents: 'none',
                }}
            >
                {/* ── Card ── */}
                <div
                    className="plm-card"
                    style={{
                        pointerEvents: 'all',
                        position: 'relative',
                        width: '100%',
                        maxWidth: 520,
                        maxHeight: 'calc(100dvh - 32px)',
                        overflowY: 'auto',
                        background: '#ffffff',
                        borderRadius: 28,
                        padding: 'clamp(28px, 6vw, 52px)',
                        boxShadow:
                            '0 4px 24px rgba(13,11,10,0.06), 0 32px 80px rgba(13,11,10,0.18)',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        aria-label="Cerrar"
                        style={{
                            position: 'absolute', top: 18, right: 18,
                            width: 34, height: 34, borderRadius: '50%',
                            border: '1.5px solid rgba(13,11,10,0.10)',
                            background: 'transparent', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#8a8280', transition: 'all 0.2s',
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#f14722'
                            e.currentTarget.style.color = '#f14722'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(13,11,10,0.10)'
                            e.currentTarget.style.color = '#8a8280'
                        }}
                    >
                        <X size={14} strokeWidth={2} />
                    </button>

                    {state === 'success' ? (
                        /* ── Success ──────────────────────────────── */
                        <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
                            <CheckCircle2
                                size={52}
                                strokeWidth={1.5}
                                style={{ color: '#f14722', margin: '0 auto 20px' }}
                            />
                            <h3 style={{
                                fontFamily: "'DM Serif Display', serif",
                                fontSize: 'clamp(22px, 4vw, 30px)',
                                fontWeight: 400, color: '#0d0b0a',
                                lineHeight: 1.1, marginBottom: 12,
                            }}>
                                ¡Consulta enviada!
                            </h3>
                            <p style={{
                                fontFamily: "'DM Sans', sans-serif",
                                fontSize: 14, fontWeight: 300,
                                color: '#6b6460', lineHeight: 1.75,
                            }}>
                                Nos pondremos en contacto con vos a la brevedad para coordinar los próximos pasos.
                            </p>
                        </div>
                    ) : (
                        /* ── Form ─────────────────────────────────── */
                        <>
                            {/* Plan eyebrow */}
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                marginBottom: 18,
                            }}>
                                <span style={{
                                    width: 20, height: 1,
                                    background: '#f14722', display: 'block', flexShrink: 0,
                                }} />
                                <span style={{
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontSize: 10, fontWeight: 600,
                                    letterSpacing: '0.2em', textTransform: 'uppercase',
                                    color: '#f14722',
                                }}>
                                    {plan}
                                </span>
                            </div>

                            <h3 style={{
                                fontFamily: "'DM Serif Display', serif",
                                fontSize: 'clamp(22px, 4vw, 32px)',
                                fontWeight: 400, color: '#0d0b0a',
                                lineHeight: 1.08, marginBottom: 8,
                            }}>
                                Hablemos de tu proyecto.
                            </h3>
                            <p style={{
                                fontFamily: "'DM Sans', sans-serif",
                                fontSize: 13, fontWeight: 300,
                                color: '#8a8280', lineHeight: 1.65,
                                marginBottom: 28,
                            }}>
                                Completá el formulario y te contactamos para cerrar los detalles.
                            </p>

                            <form
                                onSubmit={handleSubmit}
                                noValidate
                                style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
                            >
                                <div
                                    className="plm-grid"
                                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
                                >
                                    {field('name',     'Nombre',      'text',  'Tu nombre',           firstInputRef as React.RefObject<HTMLInputElement>)}
                                    {field('business', 'Restaurante', 'text',  'Nombre del local')}
                                </div>
                                {field('email', 'Email',    'email', 'tu@email.com')}
                                {field('phone', 'Teléfono', 'tel',   '+54 9 11 0000 0000')}

                                {state === 'error' && (
                                    <p style={{
                                        fontFamily: "'DM Sans', sans-serif",
                                        fontSize: 12, color: '#d63b1f',
                                        marginTop: -6,
                                    }}>
                                        {errorMsg}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={state === 'loading'}
                                    style={{
                                        marginTop: 4,
                                        height: 48, borderRadius: 48,
                                        background: state === 'loading' ? '#8a8280' : '#0d0b0a',
                                        color: '#f7f4f1',
                                        border: 'none',
                                        cursor: state === 'loading' ? 'not-allowed' : 'pointer',
                                        fontFamily: "'DM Sans', sans-serif",
                                        fontSize: 11, fontWeight: 600,
                                        letterSpacing: '0.1em', textTransform: 'uppercase',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        transition: 'background 0.25s',
                                        width: '100%',
                                    }}
                                    onMouseEnter={e => {
                                        if (state !== 'loading')
                                            e.currentTarget.style.background = '#f14722'
                                    }}
                                    onMouseLeave={e => {
                                        if (state !== 'loading')
                                            e.currentTarget.style.background = '#0d0b0a'
                                    }}
                                >
                                    {state === 'loading'
                                        ? 'Enviando…'
                                        : <><span>Enviar consulta</span><ArrowRight size={13} /></>
                                    }
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </>
    )

    return createPortal(content, document.body)
}
