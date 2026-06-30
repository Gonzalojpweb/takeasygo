'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, X } from 'lucide-react'
import { toast } from 'sonner'

const VIDEO_URL = 'https://res.cloudinary.com/dypcq8lsa/video/upload/v1773027798/Staff_hands_bag_to_customer_13de22737f_ldrgmu.mp4'

const FIELDS = [
    { key: 'nombre',          label: 'Nombre del restaurante', placeholder: 'Ej: La Parrilla de Juan',      type: 'text'  },
    { key: 'instagram',       label: 'Instagram',              placeholder: '@turestaurante',               type: 'text'  },
    { key: 'email',           label: 'Mail de contacto',       placeholder: 'hola@turestaurante.com',       type: 'email' },
    { key: 'telefono',        label: 'Teléfono de contacto',   placeholder: '+54 11 1234-5678',             type: 'tel'   },
    { key: 'tipoRestaurante', label: 'Tipo de restaurante',    placeholder: 'Ej: Parrilla, Cafetería, Dark Kitchen…', type: 'text' },
]

const EMPTY = { nombre: '', instagram: '', email: '', telefono: '', tipoRestaurante: '' }

export default function CTASection() {
    const [open, setOpen]       = useState(false)
    const [loading, setLoading] = useState(false)
    const [form, setForm]       = useState(EMPTY)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/network', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Error desconocido')
            toast.success('¡Restaurante registrado! Te contactamos pronto.')
            setOpen(false)
            setForm(EMPTY)
        } catch (err: any) {
            toast.error(err.message || 'Algo salió mal. Intentá de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
            `}</style>

            {/* ── Sección CTA con video de fondo ─────────────────────────────── */}
            <section
                className="relative overflow-hidden"
                style={{ borderRadius: '20px', margin: '20px' }}
            >
                {/* Video background */}
                <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                >
                    <source src={VIDEO_URL} type="video/mp4" />
                </video>

                {/* Overlay naranja — opacidad para que el video se vea debajo */}
                <div
                    className="absolute inset-0"
                    style={{ background: 'rgba(241,71,34,0.84)' }}
                />

                {/* Contenido */}
                <div className="relative z-10 px-8 md:px-20 py-24 md:py-36">
                    <motion.div
                        className="max-w-3xl"
                        initial={{ opacity: 0, y: 36 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                        {/* Eyebrow */}
                        <div className="flex items-center gap-3 mb-10">
                            <span style={{ width: 28, height: 1, background: 'rgba(247,244,242,0.4)', display: 'block', flexShrink: 0 }} />
                            <span style={{
                                fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                                letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(247,244,242,0.6)',
                            }}>
                                Formá parte de la red
                            </span>
                        </div>

                        {/* Headline */}
                        <h2 style={{
                            fontFamily: "'DM Serif Display', serif",
                            fontSize: 'clamp(30px, 4vw, 52px)',
                            fontWeight: 400, lineHeight: 1.12, letterSpacing: '-0.02em',
                            color: '#f7f4f2', marginBottom: 32,
                        }}>
                            Tu restaurante no es solo un negocio.{' '}
                            <em style={{ fontStyle: 'italic', color: 'rgba(247,244,242,0.75)' }}>
                                Es parte de lo que mueve el barrio.
                            </em>
                        </h2>

                        {/* Copy */}
                        <div style={{
                            fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 300,
                            lineHeight: 1.85, color: 'rgba(247,244,242,0.72)', marginBottom: 40,
                        }}>
                            <p style={{ marginBottom: 14 }}>
                                No son solo parte de la economía. Son quien la hace funcionar.
                            </p>
                            <p style={{ marginBottom: 14 }}>
                                Los restaurantes generan empleo, sostienen barrios y crean comunidad.
                                Pero muchas plataformas terminan invisibilizando a negocios reales detrás
                                de publicidad, rankings y competencia por visibilidad.
                            </p>
                            <p style={{ marginBottom: 14 }}>
                                TakeasyGO busca cambiar esa lógica.
                            </p>
                            <p>
                                Si todavía no querés usar el sistema, podés registrar tu restaurante gratis
                                y formar parte de los negocios que estamos empezando a mapear.
                            </p>
                        </div>

                        {/* Bajada */}
                        <p style={{
                            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
                            letterSpacing: '0.06em', color: 'rgba(247,244,242,0.5)', marginBottom: 36,
                        }}>
                            Registrá tu restaurante mientras seguimos sumando nuevos locales.
                        </p>

                        {/* CTA button */}
                        <button
                            onClick={() => setOpen(true)}
                            style={{
                                height: 52, padding: '0 32px',
                                background: '#f7f4f2', color: '#0d0b0a',
                                border: 'none', borderRadius: 52,
                                fontFamily: "'DM Sans', sans-serif",
                                fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
                                boxShadow: '0 4px 24px rgba(13,11,10,0.15)',
                                transition: 'opacity 0.2s, transform 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '1';    e.currentTarget.style.transform = 'translateY(0)' }}
                        >
                            Registrá tu restaurante
                            <ArrowRight size={14} />
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* ── Modal de registro ────────────────────────────────────────────── */}
            {open && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => !loading && setOpen(false)}
                    />

                    {/* Card */}
                    <motion.div
                        className="relative z-10 bg-white rounded-3xl p-8 md:p-10 w-full max-w-lg shadow-2xl overflow-y-auto"
                        style={{ maxHeight: '90dvh' }}
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                        {/* Cerrar */}
                        <button
                            onClick={() => !loading && setOpen(false)}
                            className="absolute top-5 right-5 text-zinc-300 hover:text-zinc-700 transition-colors"
                        >
                            <X size={20} />
                        </button>

                        {/* Eyebrow */}
                        <div className="flex items-center gap-2 mb-5">
                            <span style={{ width: 18, height: 1, background: '#f14722', display: 'block', flexShrink: 0 }} />
                            <span style={{
                                fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                                letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f14722',
                            }}>
                                Registrá tu restaurante
                            </span>
                        </div>

                        {/* Título */}
                        <h3 style={{
                            fontFamily: "'DM Serif Display', serif",
                            fontSize: 'clamp(20px, 3vw, 26px)',
                            fontWeight: 400, lineHeight: 1.15, color: '#0d0b0a', marginBottom: 28,
                        }}>
                            Formá parte de la red TakeasyGO
                        </h3>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            {FIELDS.map(({ key, label, placeholder, type }) => (
                                <div key={key}>
                                    <label style={{
                                        fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                                        letterSpacing: '0.18em', textTransform: 'uppercase',
                                        color: '#8a8280', display: 'block', marginBottom: 6,
                                    }}>
                                        {label}
                                        {key === 'instagram' && (
                                            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 6, opacity: 0.6 }}>
                                                (opcional)
                                            </span>
                                        )}
                                    </label>
                                    <input
                                        type={type}
                                        required={key !== 'instagram'}
                                        placeholder={placeholder}
                                        value={(form as any)[key]}
                                        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                                        style={{
                                            width: '100%', height: 46, padding: '0 16px',
                                            border: '1.5px solid #e8e5e2', borderRadius: 12,
                                            fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                                            color: '#0d0b0a', background: '#fafaf9', outline: 'none',
                                            transition: 'border-color 0.2s',
                                        }}
                                        onFocus={e => e.currentTarget.style.borderColor = '#f14722'}
                                        onBlur={e => e.currentTarget.style.borderColor = '#e8e5e2'}
                                    />
                                </div>
                            ))}

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    marginTop: 8, height: 50,
                                    background: loading ? '#d4c8c2' : '#f14722',
                                    color: '#f7f4f2', border: 'none', borderRadius: 50,
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    transition: 'background 0.2s',
                                }}
                            >
                                {loading ? 'Registrando…' : 'Registrar restaurante'}
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </>
    )
}
