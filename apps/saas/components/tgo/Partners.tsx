export default function Partners() {
  const logos = [
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1786553835/takeasygo/pizza-crash/w3iqovmvzkxdhofdjbch.png', alt: 'Pizza Crash' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1771737217/log_qe3u6a.png', alt: 'Parrilla Compadres' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1779499780/takeasygo/kekelarry/dyxu6loezfulf3sudzq2.png', alt: 'Keke&Larry' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1780510318/takeasygo/bryant-coffee/jygjecmkid3cnbjbnlv7.png', alt: 'Bryant Cafe' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1781406329/takeasygo/sazon-del-per/d7ogrmzcrpm08tmr55p2.png', alt: 'Sazón del Perú' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1785255722/takeasygo/losmuchachosdepuntoybanca/at0oxv1kspsnoj0nkhu8.png', alt: 'Los Muchachos de Punto y Banca' },
    { src: 'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1785540663/takeasygo/chopisburger/iockxpkwcupfwvvh3rtv.png', alt: 'Chopis Burgers' },
  ]

  return (
    <section
      style={{
        padding: '52px 0',
        borderBottom: '1px solid var(--tgo-line-on-paper)',
      }}
    >
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 28,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-big-shoulders), sans-serif',
              fontWeight: 700,
              fontSize: 20,
            }}
          >
            +100 restaurantes en la red
          </span>
          <span
            style={{
              fontSize: 12.5,
              color: 'var(--tgo-text-on-paper-soft)',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            Y sumando cada semana
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {logos.map((logo) => (
            <img
              key={logo.alt}
              src={logo.src}
              alt={logo.alt}
              width={56}
              height={56}
              style={{
                objectFit: 'contain',
                borderRadius: 8,
                background: '#fff',
                border: '1px solid var(--tgo-line-on-paper)',
                padding: 7,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
