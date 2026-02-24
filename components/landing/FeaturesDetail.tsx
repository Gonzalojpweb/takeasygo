'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { cn } from '@/lib/utils'

gsap.registerPlugin(ScrollTrigger)

const features = [
    {
        title: 'Target Promotions',
        subtitle: 'Notificaciones Push Estratégicas',
        desc: 'Envía mensajes y ofertas exclusivas directamente al celular de tus clientes, incentivando el regreso y la fidelidad.',
        image: 'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=2070&auto=format&fit=crop'
    },
    {
        title: 'QR Code Menu',
        subtitle: 'Acceso Instantáneo',
        desc: 'Brinda a tus clientes acceso total a tu menú digital a través de QRs personalizados, eliminando esperas y optimizando el servicio.',
        image: 'https://images.unsplash.com/photo-1590650153855-d9e808231d41?q=80&w=2070&auto=format&fit=crop'
    },
    {
        title: 'Intelligent Upselling',
        subtitle: 'Aumenta el Ticket Promedio',
        desc: 'Sugerencias automatizadas durante el flujo de pedido que invitan a tus clientes a descubrir nuevos sabores y complementos.',
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=2074&auto=format&fit=crop'
    },
    {
        title: 'Club de Fidelización',
        subtitle: 'Crea Comunidad',
        desc: 'Transforma clientes ocasionales en recurrentes con un sistema de puntos y recompensas diseñado para el crecimiento mutuo.',
        image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=2070&auto=format&fit=crop'
    },
    {
        title: 'Acceso Universal',
        subtitle: 'Control en tiempo real',
        desc: 'Gestiona tu plataforma desde cualquier dispositivo y en cualquier momento. La información de tu negocio siempre a mano.',
        image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop'
    }
]

export default function FeaturesDetail() {
    // ── Desktop refs ─────────────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null)
    const desktopRef = useRef<HTMLDivElement>(null)
    const leftRef = useRef<HTMLDivElement>(null)
    const rightRef = useRef<HTMLDivElement>(null)

    // ── Mobile refs ──────────────────────────────────────────────────────────
    const mobileRef = useRef<HTMLDivElement>(null)
    const mobileTextTrackRef = useRef<HTMLDivElement>(null)
    const progressBarRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        const mm = gsap.matchMedia()

        // ═══════════════════════════════════════════════════════════════════
        // DESKTOP (≥ 768px)
        // Pin vertical, texto baja en Y, imagen hace crossfade
        // ═══════════════════════════════════════════════════════════════════
        mm.add('(min-width: 768px)', () => {
            if (!desktopRef.current) return

            const sections = desktopRef.current.querySelectorAll('.feature-detail-step')
            const images = desktopRef.current.querySelectorAll('.feature-detail-image')

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: desktopRef.current,
                    start: 'top top',
                    end: `+=${sections.length * 100}%`,
                    pin: true,
                    scrub: 1,
                },
            })

            sections.forEach((_section: any, i: number) => {
                if (i > 0) {
                    tl.to(images[i - 1] as any, { opacity: 0, scale: 1.1, duration: 0.5 }, i)
                    tl.fromTo(images[i] as any, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5 }, i)
                }
                if (i < sections.length - 1) {
                    tl.to(leftRef.current, {
                        yPercent: -(100 / sections.length) * (i + 1),
                        duration: 1,
                        ease: 'power2.inOut',
                    }, i + 0.5)
                }
            })
        })

        // ═══════════════════════════════════════════════════════════════════
        // MOBILE (< 768px)
        // Misma asincronía que desktop: texto desliza horizontal (X),
        // imagen hace crossfade con el mismo offset de timing.
        //
        //   Posición i     → imagen crossfade (foto i-1 → foto i)
        //   Posición i+0.5 → texto desliza al panel i+1
        //
        // Texto lidera, imagen sigue — idéntico al desktop.
        // ═══════════════════════════════════════════════════════════════════
        mm.add('(max-width: 767px)', () => {
            if (!mobileRef.current || !mobileTextTrackRef.current) return

            const mobileImages = mobileRef.current.querySelectorAll('.fd-mobile-image')
            const vw = mobileRef.current.clientWidth

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: mobileRef.current,
                    start: 'top top',
                    // Mismo end que desktop: N × 100% del alto del trigger (= N × 100dvh)
                    end: `+=${features.length * 100}%`,
                    pin: true,
                    scrub: 1,
                    anticipatePin: 1,
                },
            })

            for (let i = 0; i < features.length; i++) {
                // Imagen crossfade en posición i (imagen lidera al final de cada segmento)
                if (i > 0) {
                    tl.to(mobileImages[i - 1], {
                        opacity: 0, scale: 1.06,
                        ease: 'power2.in',
                        duration: 0.5,
                    }, i)
                    tl.fromTo(mobileImages[i],
                        { opacity: 0, scale: 0.97 },
                        { opacity: 1, scale: 1, ease: 'power2.out', duration: 0.5 },
                        i
                    )
                }

                // Texto desliza en posición i + 0.5 (texto va primero, como en desktop)
                if (i < features.length - 1) {
                    tl.to(mobileTextTrackRef.current, {
                        x: -((i + 1) * vw),
                        duration: 1,
                        ease: 'power2.inOut',
                    }, i + 0.5)
                }
            }

            // Barra de progreso sincronizada al scroll
            if (progressBarRef.current) {
                gsap.to(progressBarRef.current, {
                    scaleX: 1,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: mobileRef.current,
                        start: 'top top',
                        end: `+=${features.length * 100}%`,
                        scrub: 1,
                    },
                })
            }
        })

        return () => mm.revert()
    }, { scope: containerRef })

    return (
        <section id="features" ref={containerRef} className="bg-white border-t border-zinc-100">

            {/* ═══════════════════════════════════════════════════════════════
                DESKTOP — pinned two-column, sin cambios
            ═══════════════════════════════════════════════════════════════ */}
            <div ref={desktopRef} className="hidden md:flex h-screen w-full overflow-hidden">

                {/* Left: texto que baja (GSAP yPercent) */}
                <div className="w-1/2 h-full relative px-20 flex flex-col items-center">
                    <div ref={leftRef} className="w-full flex flex-col">
                        {features.map((f, i) => (
                            <div key={i} className="feature-detail-step h-screen flex flex-col justify-center shrink-0">
                                <span className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.3em] mb-4">
                                    Funcionalidad 0{i + 1}
                                </span>
                                <h3 className="text-3xl md:text-5xl font-bold text-zinc-900 tracking-tight mb-6">
                                    {f.title}
                                </h3>
                                <p className="text-zinc-500 font-bold mb-4 text-sm uppercase tracking-widest">
                                    {f.subtitle}
                                </p>
                                <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-md">
                                    {f.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: imágenes apiladas con crossfade */}
                <div ref={rightRef} className="w-1/2 h-full relative p-20 flex items-center justify-center bg-zinc-50">
                    <div className="w-full aspect-square max-w-lg relative rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white">
                        {features.map((f, i) => (
                            <img
                                key={i}
                                src={f.image}
                                alt={f.title}
                                className={cn(
                                    'feature-detail-image absolute inset-0 w-full h-full object-cover',
                                    i === 0 ? 'opacity-100' : 'opacity-0'
                                )}
                            />
                        ))}
                    </div>
                    <div className="absolute top-1/2 right-10 -translate-y-1/2 flex flex-col gap-4 opacity-20">
                        {features.map((_, i) => (
                            <div key={i} className="w-1 h-8 bg-zinc-300 rounded-full" />
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                MOBILE — pinned, imagen crossfade (arriba) + texto horizontal (abajo)
                Asincronía: texto lidera en X, imagen sigue con crossfade.
                Mismo patrón de timing que desktop (posición i vs i+0.5).
            ═══════════════════════════════════════════════════════════════ */}
            <div
                ref={mobileRef}
                className="md:hidden relative overflow-hidden"
                style={{ height: '100dvh' }}
            >
                {/* ── Imagen: fija, apiladas, crossfade via GSAP ── */}
                <div
                    className="relative overflow-hidden"
                    style={{ height: '55%' }}
                >
                    {/* Degradado inferior para separar del texto */}
                    <div
                        className="absolute inset-0 pointer-events-none z-10"
                        style={{
                            background: 'linear-gradient(to bottom, transparent 60%, rgba(255,255,255,0.25) 100%)',
                        }}
                    />

                    {/* Imágenes apiladas: GSAP anima opacity + scale igual que desktop */}
                    {features.map((f, i) => (
                        <img
                            key={i}
                            src={f.image}
                            alt={f.title}
                            className="fd-mobile-image absolute inset-0 w-full h-full object-cover"
                            style={{ opacity: i === 0 ? 1 : 0 }}
                            loading={i === 0 ? 'eager' : 'lazy'}
                        />
                    ))}

                    {/* Eyebrow estático sobre la imagen */}
                    <div
                        className="absolute bottom-4 left-5 z-20 flex items-center gap-2"
                        style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 9,
                            fontWeight: 500,
                            letterSpacing: '0.22em',
                            textTransform: 'uppercase',
                            color: 'rgba(247,244,241,0.7)',
                        }}
                    >
                        <span style={{ width: 14, height: 1, background: '#f14722', display: 'block', flexShrink: 0 }} />
                        Funcionalidades
                    </div>
                </div>

                {/* ── Texto: track horizontal que GSAP desliza en X ── */}
                <div
                    className="overflow-hidden border-t border-zinc-100 bg-white"
                    style={{ height: '45%' }}
                >
                    <div
                        ref={mobileTextTrackRef}
                        className="flex h-full"
                        style={{ width: `${features.length * 100}vw` }}
                    >
                        {features.map((f, i) => (
                            <div
                                key={i}
                                className="flex-shrink-0 flex flex-col justify-center"
                                style={{ width: '100vw', height: '100%', padding: '20px 24px' }}
                            >
                                <span
                                    style={{
                                        fontFamily: "'DM Sans', sans-serif",
                                        fontSize: 9,
                                        fontWeight: 500,
                                        letterSpacing: '0.28em',
                                        textTransform: 'uppercase',
                                        color: '#b0aaa6',
                                        display: 'block',
                                        marginBottom: 10,
                                    }}
                                >
                                    {String(i + 1).padStart(2, '0')} / {String(features.length).padStart(2, '0')}
                                </span>
                                <h3
                                    style={{
                                        fontFamily: "'DM Serif Display', serif",
                                        fontSize: 'clamp(20px, 5.5vw, 26px)',
                                        fontWeight: 400,
                                        lineHeight: 1.1,
                                        letterSpacing: '-0.02em',
                                        color: '#0d0b0a',
                                        marginBottom: 8,
                                    }}
                                >
                                    {f.title}
                                </h3>
                                <p
                                    style={{
                                        fontFamily: "'DM Sans', sans-serif",
                                        fontSize: 10,
                                        fontWeight: 600,
                                        letterSpacing: '0.14em',
                                        textTransform: 'uppercase',
                                        color: '#8a8280',
                                        marginBottom: 10,
                                    }}
                                >
                                    {f.subtitle}
                                </p>
                                <p
                                    style={{
                                        fontFamily: "'DM Sans', sans-serif",
                                        fontSize: 13,
                                        fontWeight: 300,
                                        lineHeight: 1.65,
                                        color: '#6b6460',
                                    }}
                                >
                                    {f.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Barra de progreso — scaleX 0→1 sincronizada al scroll ── */}
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-100 z-20">
                    <div
                        ref={progressBarRef}
                        className="h-full bg-zinc-900 origin-left"
                        style={{ transform: 'scaleX(0)' }}
                    />
                </div>
            </div>

        </section>
    )
}
