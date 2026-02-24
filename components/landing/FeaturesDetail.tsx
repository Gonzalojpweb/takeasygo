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
    const containerRef = useRef<HTMLDivElement>(null)
    const desktopRef = useRef<HTMLDivElement>(null)
    const leftRef = useRef<HTMLDivElement>(null)
    const rightRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        const mm = gsap.matchMedia()

        // Only run pinned GSAP animation on desktop (≥ 768px)
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
                        ease: "power2.inOut"
                    }, i + 0.5)
                }
            })
        })

        return () => mm.revert()
    }, { scope: containerRef })

    return (
        <section id="features" ref={containerRef} className="bg-white border-t border-zinc-100">

            {/* ─── DESKTOP LAYOUT — GSAP pinned two-column ─── */}
            <div ref={desktopRef} className="hidden md:flex h-screen w-full overflow-hidden">

                {/* Left: scrolling text (GSAP-animated) */}
                <div className="w-1/2 h-full relative px-20 flex flex-col items-center">
                    <div ref={leftRef} className="w-full flex flex-col">
                        {features.map((f, i) => (
                            <div key={i} className="feature-detail-step h-screen flex flex-col justify-center shrink-0">
                                <span className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.3em] mb-4">Funcionalidad 0{i + 1}</span>
                                <h3 className="text-3xl md:text-5xl font-bold text-zinc-900 tracking-tight mb-6">{f.title}</h3>
                                <p className="text-zinc-500 font-bold mb-4 text-sm uppercase tracking-widest">{f.subtitle}</p>
                                <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-md">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: pinned image stack */}
                <div ref={rightRef} className="w-1/2 h-full relative p-20 flex items-center justify-center bg-zinc-50">
                    <div className="w-full aspect-square max-w-lg relative rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white">
                        {features.map((f, i) => (
                            <img
                                key={i}
                                src={f.image}
                                alt={f.title}
                                className={cn(
                                    "feature-detail-image absolute inset-0 w-full h-full object-cover",
                                    i === 0 ? "opacity-100" : "opacity-0"
                                )}
                            />
                        ))}
                    </div>

                    {/* Decorative progress indicator */}
                    <div className="absolute top-1/2 right-10 -translate-y-1/2 flex flex-col gap-4 opacity-20">
                        {features.map((_, i) => (
                            <div key={i} className="w-1 h-8 bg-zinc-300 rounded-full" />
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── MOBILE LAYOUT — Static scrollable feature cards ─── */}
            <div className="md:hidden py-16 px-5">
                <div className="text-center mb-12">
                    <span className="text-zinc-400 font-bold uppercase tracking-[0.3em] text-[10px] block mb-4">
                        Funcionalidades
                    </span>
                    <h2 className="text-[28px] font-bold text-zinc-900 tracking-tight leading-tight">
                        Lo que hacemos<br />por ti
                    </h2>
                </div>

                <div className="flex flex-col gap-12">
                    {features.map((f, i) => (
                        <div key={i}>
                            {/* Feature image */}
                            <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden mb-5 shadow-sm border border-zinc-100">
                                <img
                                    src={f.image}
                                    alt={f.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>

                            {/* Feature text */}
                            <span className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.3em] mb-2 block">
                                Funcionalidad 0{i + 1}
                            </span>
                            <h3 className="text-xl font-bold text-zinc-900 tracking-tight mb-2">{f.title}</h3>
                            <p className="text-zinc-500 font-bold mb-3 text-[10px] uppercase tracking-widest">{f.subtitle}</p>
                            <p className="text-zinc-400 text-sm font-medium leading-relaxed">{f.desc}</p>

                            {/* Subtle divider */}
                            {i < features.length - 1 && (
                                <div className="mt-12 h-px bg-gradient-to-r from-zinc-100 via-zinc-200 to-transparent" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

        </section>
    )
}
