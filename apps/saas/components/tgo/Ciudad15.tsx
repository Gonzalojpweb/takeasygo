'use client'

import { OrbitingCircles } from '@/registry/magicui/orbiting-circles'
import { TgoFaceActivo, TgoFaceDescansando, TgoFaceGuiño, TgoFaceReferente, TgoLogoCenter } from './TgoIcons'

const restaurantLogos = [
  { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1786553835/takeasygo/pizza-crash/w3iqovmvzkxdhofdjbch.png', alt: 'Pizza Crash' },
  { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1771737217/log_qe3u6a.png', alt: 'Parrilla Compadres' },
  { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1779499780/takeasygo/kekelarry/dyxu6loezfulf3sudzq2.png', alt: 'Keke&Larry' },
  { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1780510318/takeasygo/bryant-coffee/jygjecmkid3cnbjbnlv7.png', alt: 'Bryant Cafe' },
  { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1781406329/takeasygo/sazon-del-per/d7ogrmzcrpm08tmr55p2.png', alt: 'Sazón del Perú' },
  { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1785255722/takeasygo/losmuchachosdepuntoybanca/at0oxv1kspsnoj0nkhu8.png', alt: 'Los Muchachos' },
  { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1785540663/takeasygo/chopisburger/iockxpkwcupfwvvh3rtv.png', alt: 'Chopis Burgers' },
]

function RestaurantLogoIcon({ src, alt }: { src: string; alt: string }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: '#fff',
        border: '1px solid var(--tgo-line-on-paper)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(20,23,28,0.08)',
      }}
    >
      <img src={src} alt={alt} style={{ width: 30, height: 30, objectFit: 'contain' }} />
    </div>
  )
}

export default function Ciudad15() {
  return (
    <section id="ciudad" style={{ padding: '88px 0' }}>
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '0 28px',
          display: 'grid',
          gridTemplateColumns: '0.9fr 1.1fr',
          gap: 60,
          alignItems: 'center',
        }}
        className="tgo-two-col"
      >
        {/* Orbiting Circles */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 400,
            aspectRatio: '1',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Inner orbit — restaurant logos */}
          <OrbitingCircles iconSize={44} radius={110} speed={0.6}>
            {restaurantLogos.map((logo) => (
              <RestaurantLogoIcon key={logo.alt} src={logo.src} alt={logo.alt} />
            ))}
          </OrbitingCircles>

          {/* Outer orbit — TGO face icons */}
          <OrbitingCircles iconSize={36} radius={170} speed={0.3} reverse>
            <TgoFaceActivo size={36} />
            <TgoFaceDescansando size={36} />
            <TgoFaceGuiño size={36} />
            <TgoFaceReferente size={36} />
          </OrbitingCircles>

          {/* Center label */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              zIndex: 10,
            }}
          >
            <TgoLogoCenter size={48} />
            <div
              style={{
                background: 'var(--tgo-ink)',
                color: 'var(--tgo-text-on-ink)',
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: 5,
                whiteSpace: 'nowrap',
              }}
            >
              15 min a pie
            </div>
          </div>
        </div>

        {/* Copy */}
        <div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--tgo-signal)',
              marginBottom: 10,
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            LA IDEA
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-big-shoulders), sans-serif',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              lineHeight: 0.94,
              fontSize: 'clamp(30px, 4vw, 46px)',
            }}
          >
            Un barrio que resuelve tu día, no un algoritmo que decide por vos.
          </h2>
          <p
            style={{
              fontSize: 15.5,
              color: 'var(--tgo-text-on-paper-soft)',
              lineHeight: 1.7,
              marginTop: 6,
              maxWidth: 480,
            }}
          >
            La ciudad de los 15 minutos es un principio de planificación urbana: todo lo que necesitás debería estar a una caminata corta. TGO aplica esa misma lógica a la comida — te muestra lo que está cerca de verdad, no lo que paga más por aparecer primero.
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .tgo-two-col { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  )
}
