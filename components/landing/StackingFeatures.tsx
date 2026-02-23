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
        desc: 'Colores, tipografía y estilo visual que se adaptan a la personalidad única de tu restaurante.',
        num: '01',
    },
    {
        icon: Smartphone,
        title: 'Diseño Intuitivo',
        desc: 'Una interfaz rápida y fluida que hace que el proceso de pedido sea natural y sin fricciones.',
        num: '02',
    },
    {
        icon: Globe,
        title: 'Canal de Venta Propio',
        desc: 'Independencia total de terceros. Tus clientes compran directamente en tu plataforma.',
        num: '03',
    },
    {
        icon: Zap,
        title: 'Gestión Eficiente',
        desc: 'Integración de pagos con plataformas seguras como MercadoPoago y sistematización de pedidos para que solo te enfoques en la cocina.',
        num: '04',
    },
]

// Cuántos px desde el top se pina cada card (se van apilando)
const CARD_OFFSET = 16 // px de separación visual entre cards apiladas

export default function StackingFeatures() {
    const containerRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        const cards = gsap.utils.toArray<HTMLElement>('.sf-card')
        const total = cards.length

        cards.forEach((card, i) => {
            // ── PIN de cada card ──────────────────────────────────────────
            // Cada card se pina cuando llega al top, con un offset creciente
            // para que se vean apiladas
            ScrollTrigger.create({
                trigger: card,
                start: `top top+=${CARD_OFFSET * i}`,
                endTrigger: containerRef.current,
                end: 'bottom bottom',
                pin: true,
                pinSpacing: false,
            })

            // ── SCALE DOWN de las cards anteriores ────────────────────────
            // Cuando la card i entra, las anteriores (0..i-1) se achican
            // creando el efecto de que "van hacia atrás"
            if (i > 0) {
                // Cada card anterior se encoje un poco más cuanto más atrás está
                for (let j = 0; j < i; j++) {
                    const depth = i - j // cuántas cards hay encima
                    gsap.to(cards[j], {
                        scale: 1 - depth * 0.04,
                        y: -(depth * 10),
                        borderRadius: '28px',
                        ease: 'none',
                        scrollTrigger: {
                            trigger: card,
                            start: `top top+=${CARD_OFFSET * i}`,
                            end: `top top+=${CARD_OFFSET * i - 1}`,
                            scrub: true,
                        },
                    })
                }
            }
        })
    }, { scope: containerRef })

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

                .sf-section {
                    background: #f7f4f1;
                    padding-top: 140px;
                    padding-bottom: 200px;
                }

                /* Header */
                .sf-header {
                    text-align: center;
                    margin-bottom: 100px;
                    padding: 0 24px;
                }

                .sf-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 12px;
                    font-family: 'DM Sans', sans-serif;
                    font-size: 10px;
                    font-weight: 500;
                    letter-spacing: 0.22em;
                    text-transform: uppercase;
                    color: #8a8280;
                    margin-bottom: 20px;
                }

                .sf-eyebrow-line {
                    width: 20px;
                    height: 1px;
                    background: #f14722;
                    flex-shrink: 0;
                }

                .sf-h2 {
                    font-family: 'DM Serif Display', serif;
                    font-size: clamp(30px, 3.8vw, 52px);
                    font-weight: 400;
                    line-height: 1.08;
                    letter-spacing: -0.02em;
                    color: #0d0b0a;
                }

                .sf-h2 em {
                    font-style: italic;
                    color: #8a8280;
                }

                /* Stack container */
                .sf-stack {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 0 24px;
                    /* Altura suficiente para que todas las cards pinen bien */
                    padding-bottom: 40px;
                }

                /* Card base */
                .sf-card {
                    width: 100%;
                    min-height: 380px;
                    background: #ffffff;
                    border: 1px solid rgba(13, 11, 10, 0.06);
                    border-radius: 28px;
                    padding: 56px 60px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    will-change: transform;
                    transform-origin: top center;
                    /* Margen entre cards */
                    margin-bottom: 20px;
                    box-shadow:
                        0 1px 2px rgba(13,11,10,0.03),
                        0 12px 40px rgba(13,11,10,0.06);
                    position: relative;
                    overflow: hidden;
                }

                /* Número decorativo en bg */
                .sf-card-bg-num {
                    position: absolute;
                    right: 40px;
                    bottom: 24px;
                    font-family: 'DM Serif Display', serif;
                    font-size: 140px;
                    font-weight: 400;
                    line-height: 1;
                    letter-spacing: -0.04em;
                    color: rgba(13, 11, 10, 0.03);
                    pointer-events: none;
                    user-select: none;
                }

                .sf-card-top {
                    display: flex;
                    flex-direction: column;
                    gap: 28px;
                }

                /* Fila: icon + num */
                .sf-card-meta {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .sf-icon-wrap {
                    width: 48px;
                    height: 48px;
                    border-radius: 14px;
                    border: 1px solid rgba(13,11,10,0.07);
                    background: #f7f4f1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #0d0b0a;
                    flex-shrink: 0;
                    transition: background 0.3s, color 0.3s;
                }

                .sf-card:hover .sf-icon-wrap {
                    background: #f14722;
                    color: #f7f4f1;
                    border-color: #f14722;
                }

                .sf-num {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 10px;
                    font-weight: 500;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: #b0aaa6;
                }

                /* Texto */
                .sf-card-title {
                    font-family: 'DM Serif Display', serif;
                    font-size: clamp(26px, 3vw, 36px);
                    font-weight: 400;
                    line-height: 1.08;
                    letter-spacing: -0.02em;
                    color: #0d0b0a;
                }

                .sf-card-desc {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 15px;
                    font-weight: 300;
                    line-height: 1.75;
                    color: #6b6460;
                    max-width: 480px;
                }

                /* Línea naranja en el bottom */
                .sf-card-bottom {
                    margin-top: 48px;
                    height: 1px;
                    background: linear-gradient(90deg, rgba(241,71,34,0.18), transparent 60%);
                }

                @media (max-width: 767px) {
                    .sf-card { padding: 36px 28px; min-height: 300px; }
                    .sf-section { padding-top: 80px; padding-bottom: 120px; }
                }
            `}</style>

            <section ref={containerRef} id="features" className="sf-section">

                {/* Header */}
                <div className="sf-header">
                    <div className="sf-eyebrow">
                        <span className="sf-eyebrow-line" />
                        Excelencia Operativa
                        <span className="sf-eyebrow-line" />
                    </div>
                    <h2 className="sf-h2">
                        Herramientas que potencian<br />
                        <em>tu visión.</em>
                    </h2>
                </div>

                {/* Stack de cards */}
                <div className="sf-stack">
                    {features.map((feature, i) => {
                        const Icon = feature.icon
                        return (
                            <div key={i} className="sf-card">
                                <span className="sf-card-bg-num">{feature.num}</span>

                                <div className="sf-card-top">
                                    <div className="sf-card-meta">
                                        <div className="sf-icon-wrap">
                                            <Icon size={20} strokeWidth={1.5} />
                                        </div>
                                        <span className="sf-num">{feature.num} / {features.length.toString().padStart(2, '0')}</span>
                                    </div>

                                    <h3 className="sf-card-title">{feature.title}</h3>
                                    <p className="sf-card-desc">{feature.desc}</p>
                                </div>

                                <div className="sf-card-bottom" />
                            </div>
                        )
                    })}
                </div>

            </section>
        </>
    )
}