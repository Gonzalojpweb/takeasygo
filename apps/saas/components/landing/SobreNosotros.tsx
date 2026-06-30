'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger)

const BG_IMAGE =
  'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1774236000/ChatGPT_Image_Mar_23_2026_12_19_32_AM_ulfquk.png'

export default function SobreNosotros() {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return

    // Entry: scale sutil de 0.93 → 1 mientras la sección sube desde abajo
    // scrub 1.2 para suavidad. Se completa exactamente cuando alcanza la posición sticky.
    gsap.fromTo(
      sectionRef.current,
      { scale: 0.93, borderRadius: '32px' },
      {
        scale: 1,
        borderRadius: '20px',
        ease: 'power2.out',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 85%',   // sección entra ~15% desde abajo
          end:   'top top+=22', // llega a su posición sticky
          scrub: 1.2,
        },
      }
    )
  }, { scope: sectionRef })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

        /* Float muy sutil — se aplica al contenido interior, no a la section,
           para no colisionar con el transform de GSAP en la section */
        @keyframes sn-float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-6px); }
        }
        .sn-content-inner {
          animation: sn-float 9s ease-in-out infinite;
          will-change: transform;
        }
      `}</style>

      <section
        ref={sectionRef}
        id="sobre-nosotros"
        style={{
          /* Sticky: se "pega" en la posición del Hero cuando scrolleás sobre él */
          position: 'sticky',
          top: 20,
          zIndex: 2,
          /* Visual card — idéntico a Hero */
          margin: '0 20px',
          borderRadius: '20px',
          height: 'calc(100vh - 40px)',
          overflow: 'hidden',
          /* Imagen como único fondo — sin bgcolor */
          backgroundImage: `url('${BG_IMAGE}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Gradient overlay para legibilidad — no es bgcolor, es un gradiente semi-transparente */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(13,11,10,0.78) 0%, rgba(13,11,10,0.48) 55%, rgba(13,11,10,0.18) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Línea decorativa vertical izquierda — igual a Hero */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 80,
          width: 1,
          background:
            'linear-gradient(to bottom, transparent, rgba(247,244,242,0.10) 20%, rgba(247,244,242,0.10) 80%, transparent)',
          pointerEvents: 'none',
        }} className="hidden md:block" />

        {/* Contenido — el float se aplica aquí para separar transforms */}
        <div
          className="sn-content-inner"
          style={{
            position: 'relative',
            zIndex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 'clamp(2rem, 5vw, 5rem) clamp(1.5rem, 6vw, 5rem)',
          }}
        >
          {/* Label — mismo estilo que Hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <span style={{
              width: 36, height: 1,
              background: 'rgba(247,244,242,0.70)',
              display: 'block', flexShrink: 0,
            }} />
            <span style={{
              fontSize: 10,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(247,244,242,0.70)',
            }}>
              Quiénes somos
            </span>
          </div>

          {/* Heading principal */}
          <h2 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 'clamp(30px, 4.5vw, 62px)',
            fontWeight: 400,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            color: '#f7f4f2',
            maxWidth: 680,
            marginBottom: 20,
          }}>
            <em style={{ color: '#f14722', fontStyle: 'italic' }}>Takeasygo</em>
            {' '}es infraestructura.
          </h2>

          {/* Bajada */}
          <div style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 'clamp(13px, 1.1vw, 16px)',
            fontWeight: 300,
            lineHeight: 1.78,
            color: 'rgba(247,244,242,0.72)',
            maxWidth: 460,
            marginBottom: 48,
          }}>
            {/* <p style={{ marginBottom: 16 }}>
              <strong style={{ fontWeight: 500, color: 'rgba(247,244,242,0.90)' }}>TakeasyGO</strong> es infraestructura.
            </p> */}
            <p style={{ marginBottom: 16 }}>
              Infraestructura para entender la operación.<br />
              Para optimizar cada pedido.<br />
              Para transformar la intuición en sistema.
            </p>
            <p>
              No estamos creando una app.<br />
              Estamos redefiniendo cómo se opera en gastronomía.
            </p>
          </div>

          {/* Frase cierre */}
          <p style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 'clamp(18px, 2vw, 28px)',
            fontWeight: 400,
            fontStyle: 'italic',
            lineHeight: 1.3,
            color: 'rgba(247,244,242,0.55)',
          }}>
            El futuro no es digitalizar por digitalizar.<br />
            <em style={{ color: '#f14722', fontStyle: 'normal' }}>Es operar mejor.</em>
          </p>
        </div>
      </section>
    </>
  )
}
