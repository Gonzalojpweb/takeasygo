'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

const VIDEO_SRC = 'https://res.cloudinary.com/dypcq8lsa/video/upload/v1771881427/First_scene_a_202602212254_zo6hr_cbcltg.mp4'

const CAROUSEL_IMAGES = [
    { src: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80', alt: 'Restaurante' },
    { src: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80', alt: 'Gastronomía' },
    { src: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=80', alt: 'Chef' },
    { src: VIDEO_SRC, alt: 'Experiencia', isVideo: true },
    { src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80', alt: 'Plato' },
    { src: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80', alt: 'Local' },
]

const steps = [
    {
        title: 'Autonomía Total',
        subtitle: 'El activo del negocio',
        desc: 'Transformamos pedidos en información y clientes en relaciones duraderas.',
        num: '01',
    },
    {
        title: 'Sin Intermediarios',
        subtitle: 'Venta Directa',
        desc: 'Tu propio canal, tus propias reglas. Mantén el 100% de tu margen operativo.',
        num: '02',
    },
    {
        title: 'Identidad Digital',
        subtitle: 'Marca Propia',
        desc: 'Un menú que respira la esencia de tu local, alejándose de lo genérico.',
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

        mm.add('(min-width: 768px)', () => {
            const track = carouselTrackRef.current!
            const viewport = carouselRef.current!
            const totalWidth = track.scrollWidth - viewport.offsetWidth

            // ─────────────────────────────────────────────────────────────────
            // ACTO 1: Carrusel pinneado
            // Multiplicador 2.8 → mucho más espacio de scroll para apreciar
            // cada imagen antes de que el video llegue al centro
            // scrub 2.2 → movimiento muy suave y lento
            // ─────────────────────────────────────────────────────────────────
            const CAROUSEL_MULTIPLIER = 1.5
            const carouselScrollLength = totalWidth * CAROUSEL_MULTIPLIER

            ScrollTrigger.create({
                trigger: viewport,
                start: 'top top',
                end: `+=${carouselScrollLength}`,
                pin: true,
                anticipatePin: 1,
                scrub: 2,
                onUpdate: (self) => {
                    gsap.set(track, { x: -totalWidth * self.progress })
                },
            })

            // ─────────────────────────────────────────────────────────────────
            // ACTO 2+3: Expansión del video
            //
            // Calculamos en qué punto de scroll el video queda centrado
            // en el viewport, y desde ahí empezamos la expansión.
            // end += 1400 → expansión muy gradual y elegante
            // ─────────────────────────────────────────────────────────────────
            const videoItem = carouselVideoItemRef.current!
            const itemCenter = videoItem.offsetLeft + videoItem.offsetWidth / 2
            const viewportCenter = viewport.offsetWidth / 2
            // Progreso del track cuando el video está centrado
            const progressWhenCentered = Math.max(0, (itemCenter - viewportCenter) / totalWidth)
            // Convertimos ese progreso en px de scroll absoluto desde el top del carrusel
            const scrollWhenCentered = carouselScrollLength * progressWhenCentered

            gsap.timeline({
                scrollTrigger: {
                    trigger: viewport,
                    // Empezamos la expansión justo cuando el video llega al centro
                    start: `top+=${scrollWhenCentered} top`,
                    // 1400px de scroll para que la expansión sea cinematográfica
                    end: `top+=${scrollWhenCentered + 1400} top`,
                    scrub: 2,
                    anticipatePin: 1,
                },
            })
                .fromTo(expandWrapRef.current,
                    { opacity: 0, width: '380px', height: '500px', borderRadius: '20px' },
                    { opacity: 1, width: '100vw', height: '100vh', borderRadius: '0px', ease: 'power2.inOut' },
                    0
                )
                .fromTo(overlayRef.current,
                    { opacity: 0 },
                    { opacity: 1, ease: 'none' },
                    0.35
                )
                .fromTo(
                    headlineRef.current!.querySelectorAll('.text-line'),
                    { y: 70, opacity: 0 },
                    { y: 0, opacity: 1, stagger: 0.14, ease: 'power3.out' },
                    0.55
                )
                .fromTo(
                    '.step-card',
                    { y: 90, opacity: 0, scale: 0.95 },
                    { y: 0, opacity: 1, scale: 1, stagger: 0.18, ease: 'power2.out' },
                    0.78
                )
        })

        return () => mm.revert()
    }, { scope: sectionRef })

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

                .hiw-section { background: #f7f4f1; overflow: hidden; }

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
                    width: 380px;
                    height: 500px;
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

                .expand-wrap {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    overflow: hidden;
                    pointer-events: none;
                    z-index: 20;
                    opacity: 0;
                    width: 380px;
                    height: 500px;
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

                .text-line { display: block; overflow: hidden; }

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

                @media (max-width: 767px) {
                    .carousel-item { width: 280px; height: 380px; }
                    .carousel-viewport { padding: 0 24px; }
                    .expand-content { padding: 32px 16px; }
                    .step-card { padding: 28px 24px; }
                }
            `}</style>

            <div ref={sectionRef} className="hiw-section">
                <div ref={carouselRef} className="carousel-viewport">

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
                                    Un proceso pensado<br />
                                    <em>para la paz del dueño.</em>
                                </h2>
                            </div>
                            <div className="text-line">
                                <p className="pinned-sub">
                                    Más lealtad. Más ventas. Más crecimiento.<br />
                                    Sin fricción, sin intermediarios.
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