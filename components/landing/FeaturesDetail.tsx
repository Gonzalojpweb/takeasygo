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
    // ── Refs ────────────────────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null)

    // Desktop: pinned two-column vertical
    const desktopRef = useRef<HTMLDivElement>(null)
    const leftRef = useRef<HTMLDivElement>(null)
    const rightRef = useRef<HTMLDivElement>(null)

    // Mobile: pinned horizontal slide track
    const mobileRef = useRef<HTMLDivElement>(null)
    const mobileTrackRef = useRef<HTMLDivElement>(null)
    const progressBarRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        const mm = gsap.matchMedia()

        // ── DESKTOP (≥ 768px): scroll vertical, columna izquierda baja, imagen cambia ──
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

        // ── MOBILE (< 768px): scroll horizontal, cada slide = imagen + texto ──
        // Misma lógica de pin que desktop, eje cambia de Y a X.
        mm.add('(max-width: 767px)', () => {
            if (!mobileRef.current || !mobileTrackRef.current) return

            // El track tiene features.length * 100vw de ancho.
            // totalWidth = cuántos px necesita viajar hasta que el último slide quede centrado.
            const totalWidth = mobileTrackRef.current.scrollWidth - mobileRef.current.clientWidth

            // Track deslizante horizontal
            gsap.to(mobileTrackRef.current, {
                x: -totalWidth,
                ease: 'none',
                scrollTrigger: {
                    trigger: mobileRef.current,
                    start: 'top top',
                    end: `+=${totalWidth}`,
                    pin: true,
                    scrub: 1,
                    anticipatePin: 1,
                },
            })

            // Barra de progreso: de 0 → 100% mientras se deslizan los slides
            if (progressBarRef.current) {
                gsap.to(progressBarRef.current, {
                    scaleX: 1,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: mobileRef.current,
                        start: 'top top',
                        end: `+=${totalWidth}`,
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
                DESKTOP — pinned, dos columnas, scroll vertical izquierda + crossfade imagen
            ═══════════════════════════════════════════════════════════════ */}
            <div ref={desktopRef} className="hidden md:flex h-screen w-full overflow-hidden">

                {/* Left: columna de texto que GSAP baja */}
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

                {/* Right: imagen que hace crossfade */}
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
                MOBILE — pinned, track horizontal que se desplaza con el scroll.
                Cada slide tiene imagen (arriba, ~57% altura) + texto (abajo, ~43%).
                Imagen y texto cambian juntos al pasar al siguiente slide.
            ═══════════════════════════════════════════════════════════════ */}
            <div
                ref={mobileRef}
                className="md:hidden overflow-hidden relative"
                style={{ height: '100dvh' }}   // dvh para respetar chrome de mobile
            >
                {/* Track horizontal: N slides × 100vw */}
                <div
                    ref={mobileTrackRef}
                    className="flex h-full"
                    style={{ width: `${features.length * 100}vw` }}
                >
                    {features.map((f, i) => (
                        <div
                            key={i}
                            className="flex flex-col overflow-hidden"
                            style={{ width: '100vw', height: '100%', flexShrink: 0 }}
                        >
                            {/* ── Imagen: 57% de la altura ── */}
                            <div
                                className="relative overflow-hidden"
                                style={{ flex: '0 0 57%' }}
                            >
                                <img
                                    src={f.image}
                                    alt={f.title}
                                    className="w-full h-full object-cover"
                                    loading={i === 0 ? 'eager' : 'lazy'}
                                />
                                {/* Overlay con número de slide */}
                                <div
                                    className="absolute bottom-4 left-5 flex items-center gap-2"
                                    style={{
                                        fontFamily: "'DM Sans', sans-serif",
                                        fontSize: 10,
                                        fontWeight: 500,
                                        letterSpacing: '0.18em',
                                        textTransform: 'uppercase',
                                        color: 'rgba(247,244,241,0.7)',
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 16,
                                            height: 1,
                                            background: '#f14722',
                                            display: 'block',
                                            flexShrink: 0,
                                        }}
                                    />
                                    {String(i + 1).padStart(2, '0')} / {String(features.length).padStart(2, '0')}
                                </div>
                            </div>

                            {/* ── Texto: 43% restante ── */}
                            <div
                                className="flex flex-col justify-center bg-white border-t border-zinc-100"
                                style={{ flex: 1, padding: '24px 24px 20px' }}
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
                                    Funcionalidad 0{i + 1}
                                </span>
                                <h3
                                    style={{
                                        fontFamily: "'DM Serif Display', serif",
                                        fontSize: 'clamp(20px, 5.5vw, 26px)',
                                        fontWeight: 400,
                                        lineHeight: 1.1,
                                        letterSpacing: '-0.02em',
                                        color: '#0d0b0a',
                                        marginBottom: 6,
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
                        </div>
                    ))}
                </div>

                {/* ── Barra de progreso animada por GSAP ── */}
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-100">
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
