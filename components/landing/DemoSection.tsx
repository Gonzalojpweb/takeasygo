'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const demoImages = [
    'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772042562/ChatGPT_Image_25_feb_2026_02_45_51_p.m._meobg5.png',
    'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772038261/Iphone_on_table_with_coffee_b047a1844a_w2mryk.png',
    'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772038257/La_web_utiliza_un_fondo_blancocrema_f7f4f1_y_acent_45f3ac9529_u9qpzr.png',
    'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772038257/La_web_utiliza_un_fondo_blancocrema_f7f4f1_y_acent_c402e4742b_zcniii.png',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=2070&auto=format&fit=crop',
]

const carouselImages = [...demoImages, ...demoImages]

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export default function DemoSection() {
    const [isPaused, setIsPaused] = useState(false)
    const [formData, setFormData] = useState({ name: '', business: '', email: '', phone: '', countryCode: '+54' })
    const [submitState, setSubmitState] = useState<SubmitState>('idle')
    const [errorMsg, setErrorMsg] = useState('')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitState('loading')
        setErrorMsg('')

        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    business: formData.business,
                    email: formData.email,
                    phone: `${formData.countryCode} ${formData.phone}`,
                    plan: 'Demo – Solicitud de demostración',
                    planId: 'demo',
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setErrorMsg(data.error || 'Error al enviar. Intentá de nuevo.')
                setSubmitState('error')
                return
            }

            setSubmitState('success')
        } catch {
            setErrorMsg('Error de conexión. Intentá de nuevo.')
            setSubmitState('error')
        }
    }

    return (
        <>
            <style>{`
                @keyframes carousel-scroll {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                .demo-track {
                    animation: carousel-scroll 28s linear infinite;
                }
            `}</style>

            <section id="demo" className="bg-white py-20 md:py-32 overflow-hidden border-t border-zinc-100">

                {/* ── Header + Form ─────────────────────────────────────────── */}
                <div className="max-w-5xl mx-auto px-5 md:px-6 mb-14 md:mb-20 text-center">
                    <h2 className="text-4xl md:text-7xl font-bold text-zinc-900 tracking-tight mb-3 md:mb-4">
                        Solicita Demo
                    </h2>
                    <p className="text-zinc-500 text-base md:text-lg font-medium">
                        Aumenta la fidelidad. Impulsa las ventas.
                    </p>

                    {submitState === 'success' ? (
                        /* ── Success state ─────────────────────────────── */
                        <div className="mt-10 md:mt-16 flex flex-col items-center gap-4 py-6">
                            <CheckCircle2
                                size={52}
                                strokeWidth={1.5}
                                className="text-[#f14722]"
                            />
                            <h3 className="text-2xl md:text-3xl font-bold text-zinc-900 tracking-tight">
                                ¡Demo solicitada!
                            </h3>
                            <p className="text-zinc-500 text-base max-w-sm leading-relaxed">
                                Te contactamos en breve para agendar tu demo personalizada.
                            </p>
                        </div>
                    ) : (
                        /* ── Form ─────────────────────────────────────── */
                        <form
                            className="mt-10 md:mt-16 flex flex-col md:flex-row flex-wrap gap-6 md:gap-8 items-stretch md:items-end justify-center"
                            onSubmit={handleSubmit}
                            noValidate
                        >
                            {/* Name */}
                            <div className="flex flex-col gap-2 w-full md:min-w-[180px] md:flex-1 text-left">
                                <label
                                    htmlFor="demo-name"
                                    className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                                >
                                    Nombre
                                </label>
                                <input
                                    id="demo-name"
                                    name="name"
                                    type="text"
                                    autoComplete="name"
                                    placeholder="Tu nombre"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    disabled={submitState === 'loading'}
                                    className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                                />
                            </div>

                            {/* Business */}
                            <div className="flex flex-col gap-2 w-full md:min-w-[180px] md:flex-1 text-left">
                                <label
                                    htmlFor="demo-business"
                                    className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                                >
                                    Negocio
                                </label>
                                <input
                                    id="demo-business"
                                    name="business"
                                    type="text"
                                    autoComplete="organization"
                                    placeholder="Nombre del restaurante"
                                    required
                                    value={formData.business}
                                    onChange={handleChange}
                                    disabled={submitState === 'loading'}
                                    className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                                />
                            </div>

                            {/* Email */}
                            <div className="flex flex-col gap-2 w-full md:min-w-[180px] md:flex-1 text-left">
                                <label
                                    htmlFor="demo-email"
                                    className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                                >
                                    Email
                                </label>
                                <input
                                    id="demo-email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="tu@email.com"
                                    required
                                    value={formData.email}
                                    onChange={handleChange}
                                    disabled={submitState === 'loading'}
                                    className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                                />
                            </div>

                            {/* Phone with Country Code */}
                            <div className="flex flex-col gap-2 w-full md:min-w-[200px] md:flex-1 text-left">
                                <label
                                    htmlFor="demo-phone"
                                    className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                                >
                                    Teléfono
                                </label>
                                <div className="flex gap-2">
                                    <select
                                        name="countryCode"
                                        value={formData.countryCode}
                                        onChange={handleChange}
                                        disabled={submitState === 'loading'}
                                        className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 text-sm disabled:opacity-50 focus:outline-none focus:border-zinc-900 w-[80px]"
                                    >
                                        <option value="+54">🇦🇷 +54</option>
                                        <option value="+598">🇺🇾 +598</option>
                                        <option value="+56">🇨🇱 +56</option>
                                        <option value="+55">🇧🇷 +55</option>
                                        <option value="+51">🇵🇪 +51</option>
                                        <option value="+52">🇲🇽 +52</option>
                                        <option value="+1">🇺🇸 +1</option>
                                        <option value="+34">🇪🇸 +34</option>
                                        <option value="+44">🇬🇧 +44</option>
                                        <option value="+49">🇩🇪 +49</option>
                                        <option value="+33">🇫🇷 +33</option>
                                        <option value="+39">🇮🇹 +39</option>
                                    </select>
                                    <input
                                        id="demo-phone"
                                        name="phone"
                                        type="tel"
                                        autoComplete="tel"
                                        placeholder="9 11 0000 0000"
                                        required
                                        value={formData.phone}
                                        onChange={handleChange}
                                        disabled={submitState === 'loading'}
                                        className="flex-1 bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            <div className="w-full md:w-auto flex flex-col items-stretch md:items-end gap-2 shrink-0">
                                <Button
                                    type="submit"
                                    disabled={submitState === 'loading'}
                                    className="w-full md:w-auto bg-zinc-900 text-white rounded-full px-10 md:px-12 h-14 font-bold uppercase tracking-widest text-[11px] shadow-xl hover:bg-[#f14722] transition-all mt-2 md:mt-0 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {submitState === 'loading' ? 'Enviando…' : 'Solicitar Demo Gratuíto'}
                                </Button>

                                {submitState === 'error' && (
                                    <p className="text-xs text-red-500 font-medium text-center md:text-right mt-1">
                                        {errorMsg}
                                    </p>
                                )}
                            </div>
                        </form>
                    )}
                </div>

                {/* ── Infinite auto-scroll carousel ─────────────────────────── */}
                <div
                    className="overflow-hidden"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                    onTouchStart={() => setIsPaused(true)}
                    onTouchEnd={() => setIsPaused(false)}
                    onTouchCancel={() => setIsPaused(false)}
                    aria-hidden="true"
                >
                    <div
                        className="demo-track flex gap-4 md:gap-6 pl-5 md:pl-6"
                        style={{
                            width: 'max-content',
                            animationPlayState: isPaused ? 'paused' : 'running',
                        }}
                    >
                        {carouselImages.map((src, i) => (
                            <div
                                key={i}
                                className="min-w-[240px] md:min-w-[300px] h-[160px] md:h-[200px] rounded-2xl md:rounded-3xl overflow-hidden border border-zinc-100 shadow-sm flex-shrink-0"
                            >
                                <img
                                    src={src}
                                    alt=""
                                    className="w-full h-full object-cover hover:grayscale-0 transition-all duration-700"
                                    loading="lazy"
                                    draggable={false}
                                />
                            </div>
                        ))}
                    </div>
                </div>

            </section>
        </>
    )
}
