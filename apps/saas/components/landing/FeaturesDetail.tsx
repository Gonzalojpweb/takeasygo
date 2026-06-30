'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { cn } from '@/lib/utils'

gsap.registerPlugin(ScrollTrigger)

const features = [
    {
        title: 'Infraestructura para takeaway',
        subtitle: 'TakeasyGO ayuda a los restaurantes a organizar y gestionar sus pedidos para llevar de forma simple y confiable.',
        desc: 'Desde la toma del pedido hasta la preparación en cocina, el sistema está pensado para ordenar la operación y darle al local más control sobre sus tiempos de producción. Cuando la operación funciona mejor, la experiencia del cliente también mejora.',
        image: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772046374/func1_war8qd.png'
    },
    {
        title: 'Más que un menú digital',
        subtitle: 'TakeasyGO no es solo una carta online.',
        desc: 'Es una herramienta pensada para restaurantes que quieren trabajar mejor su operación de takeaway: pedidos claros, tiempos de preparación más previsibles y una cocina que puede enfocarse en producir.',
        image: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772046385/funcionalidad2_sscrts.png'
    },
    {
        title: 'Restaurantes que hacen las cosas bien',
        subtitle: 'En cada barrio hay restaurantes que trabajan con dedicación, que cuidan su producto y que construyen comunidad.',
        desc: 'Muchos de esos negocios quedan invisibles dentro de plataformas donde todo depende de publicidad, posicionamiento o comisiones.',
        image: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772046375/funci3_ogkgwo.png'
    },
    {
        title: 'Sin presión, sin intermediarios innecesarios',
        subtitle: 'Explorar y descubrir restaurantes debería ser simple.',
        desc: 'Sin publicidad invasiva, sin resultados manipulados y sin obligar a los negocios a competir por visibilidad.',
        image: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772046375/func4_k8llnt.png'
    },
    {
        title: 'Donde el valor se transforma en acción',
        subtitle: 'Los restaurantes son mucho más que un punto de venta.',
        desc: 'Son espacios que generan trabajo, sostienen barrios y forman parte de la vida cotidiana de las personas. Sin embargo, muchas plataformas los empujan a competir por visibilidad en lugar de ayudarlos a operar mejor.',
        image: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772046373/fun5_sjhanb.png'
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
                                <span className="text-[#f14722] font-bold text-[12px] uppercase tracking-[0.3em] mb-4">
                                    {f.title}
                                </span>
                                <h3 className="text-2xl md:text-3xl font-bold text-zinc-900 tracking-tight mb-6">
                                    {f.subtitle}
                                </h3>
                                {f.desc && (
                                    <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-md">
                                        {f.desc}
                                    </p>
                                )}
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
                                        color: '#f14722',
                                        display: 'block',
                                        marginBottom: 8,
                                    }}
                                >
                                    {f.title}
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
                                    {f.subtitle}
                                </h3>
                                {f.desc && (
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
                                )}
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
