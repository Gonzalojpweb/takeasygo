'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { Smartphone, Palette, Globe, Zap } from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

const features = [
    {
        icon: Palette,
        title: 'Control de Identidad',
        desc: 'Colores, tipografía y estilo visual que se adaptan a la personalidad única de tu restaurante.'
    },
    {
        icon: Smartphone,
        title: 'Diseño Intuitivo',
        desc: 'Una interfaz rápida y fluida que hace que el proceso de pedido sea natural y sin fricciones.'
    },
    {
        icon: Globe,
        title: 'Canal de Venta Propio',
        desc: 'Independencia total de terceros. Tus clientes compran directamente en tu plataforma.'
    },
    {
        icon: Zap,
        title: 'Gestión Eficiente',
        desc: 'Integración de pagos y sistematización de pedidos para que solo te enfoques en la cocina.'
    }
]

export default function StackingFeatures() {
    const containerRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        const cards = gsap.utils.toArray('.feature-minimal-card')

        cards.forEach((card: any, i) => {
            ScrollTrigger.create({
                trigger: card,
                start: `top top+=${120 + (i * 10)}`,
                pin: true,
                pinSpacing: false,
                endTrigger: containerRef.current,
                end: 'bottom bottom',
                scrub: true,
            })
        })
    }, { scope: containerRef })

    return (
        <section ref={containerRef} id="features" className="relative bg-white pt-24 pb-48 px-6">
            <div className="max-w-4xl mx-auto text-center mb-24">
                <span className="text-zinc-400 font-bold uppercase tracking-[0.3em] text-[10px]">Excelencia Operativa</span>
                <h2 className="text-3xl md:text-5xl font-bold text-zinc-900 tracking-tight mt-4">
                    Herramientas que potencian <br /> tu visión.
                </h2>
            </div>

            <div className="flex flex-col gap-0 max-w-5xl mx-auto">
                {features.map((feature, i) => {
                    const Icon = feature.icon
                    return (
                        <div
                            key={i}
                            className="feature-minimal-card min-h-[60vh] w-full flex items-center justify-center sticky top-0 py-4"
                        >
                            <div className="bg-white border border-zinc-100 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.03)] w-full rounded-[2.5rem] p-12 md:p-20 flex flex-col md:flex-row items-center gap-12 group transition-all duration-700">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400 group-hover:bg-zinc-900 group-hover:text-white transition-all duration-500 shrink-0">
                                    <Icon size={24} strokeWidth={1.5} />
                                </div>

                                <div className="text-center md:text-left">
                                    <h3 className="text-2xl md:text-4xl font-bold text-zinc-900 tracking-tight mb-4">
                                        {feature.title}
                                    </h3>
                                    <p className="text-zinc-500 text-lg font-medium max-w-xl leading-relaxed">
                                        {feature.desc}
                                    </p>
                                </div>

                                <div className="ml-auto hidden lg:block opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-500">
                                    <div className="text-[120px] font-black text-zinc-50 pointer-events-none">0{i + 1}</div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
