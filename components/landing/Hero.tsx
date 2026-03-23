'use client'

import { useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

const PHONE_SCREEN_FRONT = 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772049646/ChatGPT_Image_25_feb_2026__02_58_32_p.m.-removebg-preview_w0qdaq.png'
const PHONE_SCREEN_BACK  = 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772049646/ChatGPT_Image_25_feb_2026__02_46_04_p.m.-removebg-preview_hqhdwi.png'

// Outer div → ref GSAP (translate)   Inner div → CSS float animation (transform Y)
// Separados para evitar conflicto de transform
function FloatingPhones({
  phoneARef,
  phoneBRef,
}: {
  phoneARef: React.RefObject<HTMLDivElement | null>
  phoneBRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <>
      <style>{`
        @keyframes pf-a {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-16px); }
        }
        @keyframes pf-b {
          0%, 100% { transform: translateY(-10px); }
          50%       { transform: translateY(8px); }
        }
        .pf-phone-a { animation: pf-a 5.5s ease-in-out infinite; }
        .pf-phone-b { animation: pf-b 6.8s ease-in-out infinite; }

        /* Imágenes — desktop */
        .pf-img-a { width: 480px; height: auto; display: block; user-select: none; }
        .pf-img-b { width: 380px; height: auto; display: block; user-select: none; }

        /* Wrappers — desktop (absolute positioning base) */
        .pf-wrap-b { position: absolute; right: 0;  top: 0;  z-index: 1; }
        .pf-wrap-a { position: absolute; left: 10px; top: 60px; z-index: 2; }

        /* Mobile — imágenes y posiciones */
        @media (max-width: 767px) {
          .pf-img-a { width: 100%; height: 60vh; }
          .pf-img-b { width: 100%; height: 60vh; }
          .pf-wrap-b { right: -190px; top: -250px; }
          .pf-wrap-a { left: -180px;  top: -240px; }
        }
      `}</style>

      <div style={{ position: 'relative', width: 530, height: 500 }}>

        {/* Phone B */}
        <div ref={phoneBRef} className="pf-wrap-b">
          <div className="pf-phone-b">
            <Image
              src={PHONE_SCREEN_BACK}
              alt=""
              width={380}
              height={470}
              className="pf-img-b"
              draggable={false}
              unoptimized
            />
          </div>
        </div>

        {/* Phone A */}
        <div ref={phoneARef} className="pf-wrap-a">
          <div className="pf-phone-a">
            <Image
              src={PHONE_SCREEN_FRONT}
              alt=""
              width={340}
              height={490}
              className="pf-img-a"
              draggable={false}
              unoptimized
            />
          </div>
        </div>

      </div>
    </>
  )
}

// ── Floating Notifications ────────────────────────────────────────────────────

const NOTIFS = [
  {
    icon: '🔔',
    title: 'Tu pedido está listo',
    sub: 'Listo para retirar · ahora',
    accent: '#f14722',
    pos: { top: '10%', right: '4%' },
    delay: '0s',
  },
  {
    icon: '⭐',
    title: 'Agrega unas papas',
    sub: 'Acompaña tu hamburguesa',
    accent: '#f59e0b',
    pos: { top: '38%', right: '-0.5%' },
    delay: '4s',
  },
  {
    icon: '🕐',
    title: 'La Parrilla de Juan',
    sub: '≈ 15 min · Abierto ahora',
    accent: '#6366f1',
    pos: { top: '18%', right: '33%' },
    delay: '8s',
  },
  {
    icon: '✅',
    title: 'Pago confirmado',
    sub: '$4.800 · MercadoPago',
    accent: '#22c55e',
    pos: { bottom: '20%', right: '4%' },
    delay: '12s',
  },
  {
    icon: '📅',
    title: 'Recibimos tu reservación',
    sub: 'Para 2 personas · 21:00 hs',
    accent: '#a855f7',
    pos: { bottom: '28%', right: '33%' },
    delay: '16s',
  },
]

function FloatingNotifications({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <>
      <style>{`
        @keyframes notif-appear {
          0%          { opacity: 0; transform: translateY(10px) scale(0.93); }
          5%          { opacity: 1; transform: translateY(0)    scale(1);    }
          78%         { opacity: 1; transform: translateY(0)    scale(1);    }
          88%, 100%   { opacity: 0; transform: translateY(-6px) scale(0.97); }
        }
      `}</style>
      <div
        ref={containerRef}
        className="hidden md:block"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
      >
        {NOTIFS.map((n, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...n.pos,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(14px)',
              borderRadius: 16,
              padding: '10px 14px 8px 8px',
              boxShadow: '0 8px 32px rgba(13,11,10,0.14), 0 1px 4px rgba(13,11,10,0.06)',
              minWidth: 210,
              maxWidth: 260,
              animation: 'notif-appear 16s ease-in-out infinite',
              animationDelay: n.delay,
              opacity: 0,
              borderLeft: `3px solid ${n.accent}`,
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: n.accent + '1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {n.icon}
            </div>
            <div>
              <p style={{
                fontSize: 11, fontWeight: 600, color: '#0d0b0a',
                fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3, marginBottom: 2,
              }}>{n.title}</p>
              <p style={{
                fontSize: 10, color: '#8a7f7a',
                fontFamily: "'DM Sans', sans-serif", lineHeight: 1.2,
              }}>{n.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
export default function Hero() {
  const heroRef   = useRef<HTMLElement>(null)
  const textRef   = useRef<HTMLDivElement>(null)
  const phoneARef = useRef<HTMLDivElement>(null)
  const phoneBRef = useRef<HTMLDivElement>(null)
  const notifRef  = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!heroRef.current || !textRef.current) return

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: heroRef.current,
        start: 'top top',
        end: () => `+=${window.innerHeight * 0.25}`,
        scrub: 1.5,
      },
    })

    // Phone B → exits right
    if (phoneBRef.current) {
      tl.to(phoneBRef.current, { x: '160%', ease: 'power2.in', duration: 1 }, 0)
    }
    // Phone A → exits up
    if (phoneARef.current) {
      tl.to(phoneARef.current, { y: '-170%', ease: 'power2.in', duration: 1 }, 0)
    }
    // Text → exits left
    tl.to(textRef.current, { x: '-160%', ease: 'power2.in', duration: 1 }, 0)
    // Notifications → exit right with phones
    if (notifRef.current) {
      tl.to(notifRef.current, { x: '25%', opacity: 0, ease: 'power2.in', duration: 1 }, 0)
    }

  }, { scope: heroRef })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

        /* Escala los teléfonos en mobile, tamaño real en desktop */
        .phones-scaler {
          transform: scale(0.62);
          transform-origin: center bottom;
        }
        @media (min-width: 768px) {
          .phones-scaler {
            transform: none;
            transform-origin: center;
          }
        }
      `}</style>

      {/*
        Mobile:  h-[100dvh] flex-col  → texto arriba, teléfonos abajo (flex-1 restante)
        Desktop: md:h-auto md:min-h-[100vh] flex-row items-center → layout original
      */}
      <section
        ref={heroRef}
        id="what-we-do"
        className="relative h-[100dvh] md:h-auto md:min-h-[100vh] flex flex-col md:flex-row md:items-center overflow-hidden"
        style={{ background: '#f14722', borderRadius: '20px', margin: '20px', position: 'sticky', top: 20, zIndex: 1 }}
      >
        {/* Glows */}
        <div className="absolute pointer-events-none hidden md:block" style={{
          bottom: '-15%', right: '-5%', width: '60vw', height: '60vw',
          background: 'radial-gradient(ellipse at 60% 70%, rgba(247,244,243,0.35) 0%, rgba(247,243,242,0.18) 30%, transparent 55%)',
        }} />
        <div className="absolute pointer-events-none hidden md:block" style={{
          bottom: '5%', right: '10%', width: '35vw', height: '35vw',
          background: 'radial-gradient(ellipse at 50% 50%, rgba(241,71,34,0.07) 0%, transparent 65%)',
        }} />
        <div className="absolute pointer-events-none md:hidden" style={{
          bottom: 0, left: 0, right: 0, height: '72%',
          background: 'radial-gradient(ellipse 200% 60% at 50% 100%, rgba(252,252,252,0.01) 0%, rgb(241,71,34) 38%, transparent 95%)',
        }} />
        <div className="absolute top-0 bottom-0 pointer-events-none hidden md:block" style={{
          left: '80px', width: '1px',
          background: 'linear-gradient(to bottom, transparent, rgba(247,244,242,0.12) 20%, rgba(247,244,242,0.12) 80%, transparent)',
        }} />

        {/*
          Inner wrapper:
          Mobile  → flex-1 flex-col  (para que el children rellenen el 100dvh)
          Desktop → block (se comporta como antes, sin contexto flex extra)
        */}
        <div className="relative z-10 w-full px-6 md:px-20 flex-1 flex flex-col md:block">
          <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row md:items-center gap-0 flex-1 md:flex-none">

            {/* Texto — flex-none mobile (altura natural), flex-1 desktop */}
            <div ref={textRef} className="flex-none md:flex-1 md:min-w-0 pt-20 pb-2 md:py-32 md:pl-8 md:pr-16">

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7 }}
                className="flex items-center gap-3 mb-8 md:mb-10"
              >
                <span style={{ width: 36, height: 1, background: 'rgba(247,244,242,0.97)', display: 'block', flexShrink: 0 }} />
                <span style={{
                  fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                  letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(247,244,242,0.97)',
                }}>
                  Infraestructura digital para la gastronomía
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 'clamp(32px, 4.5vw, 60px)',
                  fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.02em',
                  color: '#0d0b0a', marginBottom: 20,
                }}
              >
                Una experiencia de venta <br />
                <em style={{ color: 'rgba(247,244,242,0.97)', fontStyle: 'italic' }}>superior para tu marca.</em>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.3 }}
                style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 300,
                  lineHeight: 1.75, color: 'rgba(247,244,242,0.97)', maxWidth: 440, marginBottom: 32,
                }}
              >
                Menú digital → Pedidos takeaway → Pagos online. <br />
                Con tu branding, tus colores y la identidad de tu restaurante.
              </motion.p>

              <motion.div
                className="flex flex-col sm:flex-row gap-5 items-start"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <button
                  onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                  style={{
                    height: 48, padding: '0 28px', background: '#0d0b0a', color: '#f7f4f1',
                    border: 'none', borderRadius: 48, fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
                    boxShadow: '0 2px 12px rgba(13,11,10,0.12)',
                    transition: 'background 0.25s, transform 0.15s, box-shadow 0.25s',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.background = '#f14722'
                    el.style.transform = 'translateY(-2px)'
                    el.style.boxShadow = '0 8px 24px rgba(241,71,34,0.22)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.background = '#0d0b0a'
                    el.style.transform = 'translateY(0)'
                    el.style.boxShadow = '0 2px 12px rgba(13,11,10,0.12)'
                  }}
                >
                  Comenzar ahora
                  <ArrowRight size={13} />
                </button>
              </motion.div>
            </div>

            {/*
              Teléfonos:
              Mobile  → flex-1 (toma el espacio restante), overflow-hidden para clip del scale
              Desktop → flex-none, sin overflow-hidden, tamaño natural
            */}
            <motion.div
              className="flex-1 flex items-end justify-center w-full overflow-hidden md:flex-none md:w-auto md:overflow-visible md:items-center md:justify-center"
              style={{ perspective: '1200px', minHeight: 0 }}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="phones-scaler">
                <FloatingPhones phoneARef={phoneARef} phoneBRef={phoneBRef} />
              </div>
            </motion.div>

          </div>
        </div>

        {/* Floating notification cards */}
        <FloatingNotifications containerRef={notifRef} />

      </section>
    </>
  )
}
