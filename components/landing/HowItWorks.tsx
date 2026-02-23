'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

const steps = [
    {
        title: 'Autonomía Total',
        subtitle: 'El activo del negocio',
        desc: 'Transformamos pedidos en información y clientes en relaciones duraderas.'
    },
    {
        title: 'Sin Intermediarios',
        subtitle: 'Venta Directa',
        desc: 'Tu propio canal, tus propias reglas. Mantén el 100% de tu margen operativo.'
    },
    {
        title: 'Identidad Digital',
        subtitle: 'Marca Propia',
        desc: 'Un menú que respira la esencia de tu local, alejándose de lo genérico.'
    }
]

export default function HowItWorks() {
    const containerRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        const cards = gsap.utils.toArray('.step-card')

        // Elegant stacking effect: Card behind card
        cards.forEach((card: any, i) => {
            if (i > 0) {
                gsap.fromTo(
                    card,
                    {
                        y: 300,
                        opacity: 0,
                        scale: 0.95
                    },
                    {
                        y: 0,
                        opacity: 1,
                        scale: 1,
                        scrollTrigger: {
                            trigger: card,
                            start: 'top bottom-=100',
                            end: 'top center',
                            scrub: 1,
                        },
                    }
                )
            }

            // Pinning each card slightly as it stacks
            ScrollTrigger.create({
                trigger: card,
                start: `top top+=${100 + (i * 20)}`,
                pin: true,
                pinSpacing: false,
                endTrigger: containerRef.current,
                end: 'bottom bottom',
                scrub: true,
            })
        })
    }, { scope: containerRef })

    return (
        <section ref={containerRef} id="how-we-work" className="bg-zinc-50 py-32 px-6">
            <div className="max-w-4xl mx-auto text-center mb-24">
                <span className="text-zinc-400 font-bold uppercase tracking-[0.3em] text-[10px]">Filosofía Takeasygo</span>
                <h2 className="text-3xl md:text-5xl font-bold text-zinc-900 tracking-tight mt-4">
                    Un proceso pensado para <br /> la paz del dueño.
                </h2>
            </div>

            <div className="flex flex-col gap-10 max-w-3xl mx-auto pb-40">
                {steps.map((step, i) => (
                    <div
                        key={i}
                        className="step-card bg-white border border-zinc-200/60 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] rounded-[2rem] p-12 md:p-16 flex flex-col justify-center min-h-[400px]"
                    >
                        <span className="text-orange-500 font-bold text-[10px] uppercase tracking-[0.2em] mb-4">
                            0{i + 1} / {step.subtitle}
                        </span>
                        <h3 className="text-3xl font-bold text-zinc-900 tracking-tight mb-6">
                            {step.title}
                        </h3>
                        <p className="text-zinc-500 text-lg font-medium leading-relaxed max-w-lg">
                            {step.desc}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    )
}
