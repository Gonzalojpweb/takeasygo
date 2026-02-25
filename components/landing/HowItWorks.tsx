'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

const VIDEO_SRC = 'https://res.cloudinary.com/dypcq8lsa/video/upload/v1771904127/Scene_1_a_202602240036_g1pg1_lswvtw.mp4'

// 7 items (6 fotos + video). El video en posición 5 (penúltimo) para
// que sea visible cuando el carrusel termina de desplazarse.
const CAROUSEL_IMAGES = [
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772038261/Iphone_on_table_with_coffee_b047a1844a_w2mryk.png', alt: 'Restaurante' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772038258/Fotos_de_clientes_en_restaurantes_167e7e53b8_bkypke.png', alt: 'Gastronomía' },
    { src: 'https://res.cloudinary.com/dypcq8lsa/image/upload/v1769023313/cero-cafe/dishes/enxhauqwds92sgmdstdb.png', alt: 'Menú' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772038261/La_web_utiliza_un_fondo_blancocrema_f7f4f1_y_acent_bfa90da748_ozkwe4.png', alt: 'Chef' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772038260/La_web_utiliza_un_fondo_blancocrema_f7f4f1_y_acent_da49b274a9_dupvxz.png', alt: 'Plato' },
    { src: VIDEO_SRC, alt: 'Experiencia', isVideo: true },
    { src: 'https://res.cloudinary.com/dypcq8lsa/image/upload/v1769023785/cero-cafe/dishes/jswzlgaexjdvhyezs6go.png', alt: 'Local' },
]

const steps = [
    {
        title: 'Control del canal de ventas',
        subtitle: 'El activo del negocio',
        desc: 'Cada pedido queda en tu sistema. Cada cliente, en tu base. El canal es tuyo. La información también.',
        num: '01',
    },
    {
        title: 'Venta directa, sin comisiones',
        subtitle: 'Venta Directa',
        desc: 'Pedidos propios. Pagos integrados. El margen queda en esssl restaurante. Vendés directo. Cobrás directo.',
        num: '02',
    },
    {
        title: 'Menú propio, no genérico',
        subtitle: 'Marca Propia',
        desc: 'Diseñado para vender mejor, no para parecerse a una app más.',
        num: '03',
    },
]

export default function HowItWorks() {
    const sectionRef = useRef<HTMLDivElement>(null)
    const carouselRef = useRef<HTMLDivElement>(null)
    const carouselTrackRef = useRef<HTMLDivElement>(null)
    const carouselVideoItemRef = useRef<HTMLDivElement>(null)
    const expandWrapRef = useRef<HTMLDivElement>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const headlineRef = useRef<HTMLDivElement>(null)

    useGSAP(() => {
        const mm = gsap.matchMedia()

        /**
         * ── ARQUITECTURA: UN ÚNICO TIMELINE, UN ÚNICO ScrollTrigger ──────────
         *
         * El problema de usar dos ScrollTriggers separados (uno para el carrusel
         * horizontal y otro para el expand) es que GSAP no puede coordinarlos
         * correctamente dentro de una sección pinneada con movimiento en X.
         * El trigger de posición del elemento de video nunca "dispara" en el
         * momento correcto porque el elemento no se mueve verticalmente.
         *
         * Solución: todo el flujo (carrusel → expand → contenido) vive en un
         * único gsap.timeline() con un único ScrollTrigger que pina el viewport.
         * Los actos se secuencian por posición en la timeline, no por posición
         * de elementos en el DOM.
         *
         * ACTO 1 (0 → CAROUSEL_DUR):
         *   track.x de 0 → -totalWidth  (desplazamiento del carrusel)
         *
         * ACTO 2 (CAROUSEL_DUR → +2.5):
         *   expand-wrap crece de card-size → 100vw × 100vh
         *
         * ACTO 3a (CAROUSEL_DUR+1.5 → +3):
         *   overlay aparece
         *
         * ACTO 3b (CAROUSEL_DUR+2.5 → +3.7):
         *   líneas de texto suben (stagger)
         *
         * ACTO 3c (CAROUSEL_DUR+3 → +4.8):
         *   step-cards entran desde abajo (stagger)
         *
         * Scroll total (scrollEnd):
         *   Fase carrusel: totalWidth × 1.4  (la track se mueve a ~0.7× de scroll)
         *   Fase expansion: 1600px fijos  (suficiente para todos los actos)
         *   scrollEnd = max(totalWidth, 0) × 1.4 + 1600
         *
         * Si el carrusel tiene totalWidth ≤ 0 (todos los ítems caben en viewport),
         * CAROUSEL_DUR = 0 → el expand empieza inmediatamente, sin carrusel previo.
         * ─────────────────────────────────────────────────────────────────────
         */
        const buildFullAnimation = (
            cardW: number,      // ancho inicial del expand-wrap (px)
            cardH: number,      // alto inicial del expand-wrap (px)
            cardBR: string,     // border-radius inicial del expand-wrap
            textY: number,      // offset Y inicial de las líneas de texto
            cardYFrom: number,  // offset Y inicial de las step-cards
            staggerText: number,
            staggerCards: number
        ) => {
            const vp    = carouselRef.current!
            const track = carouselTrackRef.current!

            // Cuánto puede desplazarse el track (puede ser negativo si cabe todo)
            const rawScrollWidth = track.scrollWidth - vp.offsetWidth
            const totalWidth     = Math.max(0, rawScrollWidth)

            // Duración del acto 1 en la timeline (0 si no hay overflow)
            const CAROUSEL_DUR  = totalWidth > 0 ? 10 : 0
            const EXPAND_START  = CAROUSEL_DUR  // los actos 2+3 empiezan aquí

            // Píxeles reales de scroll que consumirá cada fase
            const carouselScrollPx  = totalWidth * 1.4           // fase carrusel
            const expansionScrollPx = 2200                        // fase expand + contenido (aumentado para dar tiempo al texto)
            const scrollEnd         = carouselScrollPx + expansionScrollPx

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: vp,
                    start: 'top top',
                    end: `+=${scrollEnd}`,
                    pin: true,
                    scrub: 1.5,
                    anticipatePin: 1,
                },
            })

            // ── ACTO 1: carrusel se desliza en X ────────────────────────────
            if (totalWidth > 0) {
                tl.to(track, {
                    x: -totalWidth,
                    ease: 'none',
                    duration: CAROUSEL_DUR,
                }, 0)
            }

            // ── ACTO 2: expand-wrap crece hasta pantalla completa ────────────
            // Duración 3 → la expansión termina en EXPAND_START+3
            tl.fromTo(
                expandWrapRef.current,
                { opacity: 0, width: `${cardW}px`, height: `${cardH}px`, borderRadius: cardBR },
                { opacity: 1, width: '100vw', height: '100vh', borderRadius: '0px', ease: 'power2.inOut', duration: 3 },
                EXPAND_START
            )

            // ── ACTO 3a: overlay oscuro aparece mientras expande ─────────────
            tl.fromTo(
                overlayRef.current,
                { opacity: 0 },
                { opacity: 1, ease: 'none', duration: 2 },
                EXPAND_START + 1.5
            )

            // ── ACTO 3b: líneas de título suben — DESPUÉS de que el expand termina
            // Empieza en +3.5 para tener el pantalla completa ya establecida
            tl.fromTo(
                headlineRef.current!.querySelectorAll('.text-line'),
                { y: textY, opacity: 0 },
                { y: 0, opacity: 1, stagger: staggerText, ease: 'power3.out', duration: 1.4 },
                EXPAND_START + 3.5
            )

            // ── ACTO 3c: step-cards entran — pausa larga tras el texto
            // El texto tiene ~4 unidades de timeline para ser leído solo
            tl.fromTo(
                '.step-card',
                { y: cardYFrom, opacity: 0, scale: 0.96 },
                { y: 0, opacity: 1, scale: 1, stagger: staggerCards, ease: 'power2.out', duration: 1.8 },
                EXPAND_START + 7.5
            )
        }

        // ── Desktop (≥ 768px): card 300×420, offsets mayores ────────────────
        mm.add('(min-width: 768px)', () => {
            buildFullAnimation(300, 420, '20px', 60, 80, 0.12, 0.15)
        })

        // ── Mobile (< 768px): card 220×300, offsets más compactos ───────────
        mm.add('(max-width: 767px)', () => {
            buildFullAnimation(220, 300, '14px', 40, 50, 0.10, 0.12)
        })

        return () => mm.revert()
    }, { scope: sectionRef })

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

                /* ── Sección wrapper ── */
                .hiw-section {
                    background: #f7f4f1;
                    overflow: hidden;
                }

                /* ── ACTO 1: Viewport del carrusel ── */
                .carousel-viewport {
                    position: relative;
                    width: 100%;
                    overflow: hidden;
                    background: #f7f4f1;
                    display: flex;
                    align-items: center;
                    min-height: 100vh;
                    padding: 0 48px;
                }

                .carousel-track {
                    display: flex;
                    gap: 20px;
                    will-change: transform;
                    flex-shrink: 0;
                }

                .carousel-item {
                    flex-shrink: 0;
                    width: 300px;
                    height: 420px;
                    border-radius: 20px;
                    overflow: hidden;
                    position: relative;
                }

                .carousel-item img,
                .carousel-item video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }

                .carousel-item-num {
                    position: absolute;
                    bottom: 16px;
                    left: 20px;
                    font-family: 'DM Sans', sans-serif;
                    font-size: 10px;
                    font-weight: 500;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                    color: rgba(247,244,241,0.6);
                }

                /* ── ACTO 2+3: Expand wrap — absolute dentro del carousel-viewport ── */
                .expand-wrap {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    overflow: hidden;
                    pointer-events: none;
                    z-index: 20;
                    opacity: 0;
                    width: 300px;
                    height: 420px;
                    border-radius: 20px;
                }

                .expand-wrap video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }

                .expand-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(8, 6, 5, 0.72);
                    opacity: 0;
                    z-index: 1;
                }

                .expand-content {
                    position: absolute;
                    inset: 0;
                    z-index: 2;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 48px 24px;
                    overflow-y: auto;
                }

                .text-line {
                    display: block;
                    overflow: hidden;
                }

                .pinned-eyebrow {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 10px;
                    font-weight: 500;
                    letter-spacing: 0.24em;
                    text-transform: uppercase;
                    color: #f14722;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                }

                .pinned-eyebrow-line {
                    width: 20px;
                    height: 1px;
                    background: #f14722;
                    flex-shrink: 0;
                }

                .pinned-h2 {
                    font-family: 'DM Serif Display', serif;
                    font-size: clamp(32px, 4.5vw, 64px);
                    font-weight: 400;
                    line-height: 1.06;
                    letter-spacing: -0.02em;
                    color: #f7f4f1;
                    text-align: center;
                    margin-bottom: 16px;
                }

                .pinned-h2 em {
                    font-style: italic;
                    color: rgba(247,244,241,0.5);
                }

                .pinned-sub {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 15px;
                    font-weight: 300;
                    line-height: 1.7;
                    color: rgba(247,244,241,0.55);
                    text-align: center;
                    max-width: 380px;
                    margin: 0 auto;
                }

                .cards-inner {
                    width: 100%;
                    max-width: 580px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    margin-top: 48px;
                }

                .step-card {
                    background: rgba(247, 244, 241, 0.08);
                    border: 1px solid rgba(247, 244, 241, 0.12);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border-radius: 20px;
                    padding: 36px 40px;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    overflow: hidden;
                    opacity: 0;
                }

                .step-card-bg-num {
                    position: absolute;
                    right: 24px;
                    top: 16px;
                    font-family: 'DM Serif Display', serif;
                    font-size: 72px;
                    font-weight: 400;
                    color: rgba(247,244,241,0.05);
                    line-height: 1;
                    letter-spacing: -0.04em;
                    pointer-events: none;
                    user-select: none;
                }

                .step-num-subtitle {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                }

                .step-dot {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    background: #f14722;
                    flex-shrink: 0;
                }

                .step-num {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 10px;
                    font-weight: 500;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: #f14722;
                }

                .step-subtitle {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 10px;
                    font-weight: 400;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: rgba(247,244,241,0.3);
                }

                .step-title {
                    font-family: 'DM Serif Display', serif;
                    font-size: clamp(22px, 2.5vw, 28px);
                    font-weight: 400;
                    line-height: 1.1;
                    letter-spacing: -0.02em;
                    color: #f7f4f1;
                    margin-bottom: 10px;
                }

                .step-desc {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 13px;
                    font-weight: 300;
                    line-height: 1.7;
                    color: rgba(247,244,241,0.5);
                }

                .step-card-bottom {
                    margin-top: 24px;
                    height: 1px;
                    background: linear-gradient(90deg, rgba(241,71,34,0.3), transparent);
                }

                /* ══════════════════════════════════════════════════════════════
                   MOBILE (< 768px)
                ══════════════════════════════════════════════════════════════ */
                @media (max-width: 767px) {

                    .carousel-viewport {
                        padding: 0 16px;
                    }

                    .carousel-track { gap: 12px; }

                    .carousel-item {
                        width: 220px;
                        height: 300px;
                        border-radius: 14px;
                    }

                    /* expand-wrap: estado inicial = card mobile */
                    .expand-wrap {
                        width: 220px;
                        height: 300px;
                        border-radius: 14px;
                    }

                    .expand-content {
                        padding: 20px 14px;
                        justify-content: flex-start;
                        padding-top: 40px;
                    }

                    .pinned-eyebrow { font-size: 9px; margin-bottom: 10px; gap: 8px; }
                    .pinned-eyebrow-line { width: 14px; }

                    .pinned-h2 {
                        font-size: clamp(18px, 5.5vw, 24px);
                        margin-bottom: 8px;
                        line-height: 1.08;
                    }

                    .pinned-sub { display: none; }

                    .cards-inner { margin-top: 14px; gap: 8px; max-width: 100%; }

                    .step-card { padding: 14px 16px; border-radius: 12px; }
                    .step-card-bg-num { font-size: 40px; right: 10px; top: 8px; }
                    .step-num-subtitle { margin-bottom: 6px; gap: 8px; }
                    .step-title { font-size: 16px; margin-bottom: 4px; }
                    .step-desc { font-size: 11px; line-height: 1.55; }
                    .step-card-bottom { margin-top: 10px; }
                    .carousel-item-num { display: none; }
                }
            `}</style>

            <div id="how-we-work" ref={sectionRef} className="hiw-section">

                <div ref={carouselRef} className="carousel-viewport">

                    {/* Track de imágenes */}
                    <div ref={carouselTrackRef} className="carousel-track">
                        {CAROUSEL_IMAGES.map((item, i) => (
                            <div
                                key={i}
                                ref={item.isVideo ? carouselVideoItemRef : undefined}
                                className="carousel-item"
                            >
                                {item.isVideo ? (
                                    <video autoPlay muted loop playsInline>
                                        <source src={item.src} type="video/mp4" />
                                    </video>
                                ) : (
                                    <img src={item.src} alt={item.alt} loading="lazy" />
                                )}
                                <span className="carousel-item-num">{String(i + 1).padStart(2, '0')}</span>
                            </div>
                        ))}
                    </div>

                    {/* Expand wrap — crece de card → 100vw×100vh con GSAP */}
                    <div ref={expandWrapRef} className="expand-wrap">

                        <video autoPlay muted loop playsInline>
                            <source src={VIDEO_SRC} type="video/mp4" />
                        </video>

                        <div ref={overlayRef} className="expand-overlay" />

                        <div ref={headlineRef} className="expand-content">
                            <div className="text-line">
                                <div className="pinned-eyebrow">
                                    <span className="pinned-eyebrow-line" />
                                    Filosofía Takeasygo
                                    <span className="pinned-eyebrow-line" />
                                </div>
                            </div>
                            <div className="text-line">
                                <h2 className="pinned-h2">
                                    Un proceso diseñado<br />
                                    <em>para vender directo, sin fricción.</em>
                                </h2>
                            </div>
                            <div className="text-line">
                                <p className="pinned-sub">
                                    Pedidos directos, pagos integrados y control del canal.<br />
                                    Un flujo simple para el cliente. Previsible para el negocio.
                                </p>
                            </div>

                            <div className="cards-inner">
                                {steps.map((step, i) => (
                                    <div key={i} className="step-card">
                                        <span className="step-card-bg-num">{step.num}</span>
                                        <div className="step-num-subtitle">
                                            <span className="step-dot" />
                                            <span className="step-num">{step.num}</span>
                                            <span className="step-subtitle">/ {step.subtitle}</span>
                                        </div>
                                        <h3 className="step-title">{step.title}</h3>
                                        <p className="step-desc">{step.desc}</p>
                                        <div className="step-card-bottom" />
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </>
    )
}
