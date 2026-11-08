'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  Award, UserPlus, Wallet, MapPin, Phone, Clock, ArrowRight, Smartphone, Settings, Instagram, Facebook, Twitter,
} from 'lucide-react'
import { menuCardTheme } from '@/lib/menu-theme'
import { trackNetworkCta } from '@/lib/track'

/** Alta de comercios desde el menú: origen = menu-<comercio> para atribuir la tracción. */
function registerUrl(tenantSlug: string): string {
  const origen = `menu-${tenantSlug}`.replace(/[^a-z0-9-]/gi, '').slice(0, 40)
  return `https://takeasygo.com/empezar?origen=${encodeURIComponent(origen)}`
}

const TEXT = {
  es: {
    hello: 'Hola', memberOf: 'Sos socio de', myCard: 'Mi tarjeta', invite: 'Invitá y ganá', wallet: 'Agregar a la billetera del celular',
    hours: 'Horario de atención', directions: 'Cómo llegar', ourStory: 'Nuestra historia',
    networkOf: 'es parte de la red TakeasyGO', discover: 'Descubrí lugares y beneficios cerca tuyo', getApp: 'Descargá la App',
    haveBusiness: '¿Tenés un comercio?', joinNetwork: 'Sumalo a la red', admin: 'Acceso administrador',
  },
  en: {
    hello: 'Hi', memberOf: 'You are a member of', myCard: 'My card', invite: 'Invite & earn', wallet: 'Add to your phone wallet',
    hours: 'Opening hours', directions: 'Directions', ourStory: 'Our story',
    networkOf: 'is part of the TakeasyGO network', discover: 'Discover places and perks near you', getApp: 'Get the App',
    haveBusiness: 'Own a business?', joinNetwork: 'Join the network', admin: 'Admin access',
  },
} as const

interface Props {
  tenantSlug: string
  tenantName: string
  logoUrl?: string
  clubName: string
  /** Colores del menú: el cierre es parte del menú, no un bloque aparte. */
  primary: string
  bg: string
  text: string
  locale?: 'es' | 'en'
  location: {
    address?: string
    phone?: string
    /** «Horarios de Atención» de Configuración (texto libre que carga el comercio). */
    hours?: string
    mapsUrl?: string
  }
  about?: string
  social?: { instagram?: string; facebook?: string; twitter?: string }
  club: { show: boolean; isMember: boolean; name: string; walletEnabled: boolean }
}

const handle = (v: string) => v.replace(/^@/, '').trim()

/**
 * Cierre del menú público: club (socios), datos del local, red TakeasyGO y pie.
 * Toma el fondo, el texto y la marca del local (mismas tarjetas que la Tarjeta
 * del Club). Reemplaza al bloque oscuro fijo «Red de la Proximidad» + pie.
 */
export default function MenuClosing({
  tenantSlug, tenantName, logoUrl, clubName, primary, bg, text, locale = 'es', location, about, social, club,
}: Props) {
  const t = locale === 'en' ? TEXT.en : TEXT.es
  const theme = useMemo(() => menuCardTheme(primary, bg, text), [primary, bg, text])

  const mapsHref = location.mapsUrl || (location.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.address} ${tenantName}`)}` : '')
  const firstName = club.name.trim().split(/\s+/)[0] || ''
  const socials = [
    social?.instagram && { key: 'ig', href: `https://instagram.com/${handle(social.instagram)}`, label: `@${handle(social.instagram)}`, Icon: Instagram },
    social?.facebook && { key: 'fb', href: `https://facebook.com/${handle(social.facebook)}`, label: 'Facebook', Icon: Facebook },
    social?.twitter && { key: 'tw', href: `https://x.com/${handle(social.twitter)}`, label: `@${handle(social.twitter)}`, Icon: Twitter },
  ].filter(Boolean) as Array<{ key: string; href: string; label: string; Icon: typeof Instagram }>
  const hasPlaceInfo = Boolean(location.address || location.phone || location.hours || about || socials.length)

  const card = 'rounded-[22px] border p-4'
  const cardStyle = { background: 'var(--club-card)', borderColor: 'var(--club-line)' }
  const muted = { color: 'var(--club-muted)' }

  return (
    <footer style={theme} className="mx-auto w-full max-w-2xl px-4 pb-6 pt-7" aria-label={tenantName}>
      <div className="grid gap-3.5" style={{ color: 'var(--club-fg)' }}>
        {/* Club: solo socios */}
        {club.show && club.isMember && (
          <section
            className={`${card} grid gap-3`}
            style={{ ...cardStyle, background: 'linear-gradient(135deg, var(--club-soft), var(--club-card) 70%)' }}
            aria-label={clubName}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-extrabold" style={{ background: 'var(--club-brand)', color: 'var(--club-on-brand)' }}>
                {(firstName.charAt(0) || '★').toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold leading-tight">{firstName ? `${t.hello}, ${firstName}` : clubName}</p>
                <p className="text-[12.5px]" style={muted}>{t.memberOf} {clubName}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/${tenantSlug}/club/lookup`}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] px-3 text-[13.5px] font-bold transition-opacity hover:opacity-90"
                style={{ background: 'var(--club-brand)', color: 'var(--club-on-brand)' }}
              >
                <Award size={17} aria-hidden /> {t.myCard}
              </Link>
              <Link
                href={`/${tenantSlug}/club/invitar`}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] px-3 text-[13.5px] font-bold transition-opacity hover:opacity-90"
                style={{ background: 'var(--club-soft)', color: 'var(--club-deep)' }}
              >
                <UserPlus size={17} aria-hidden /> {t.invite}
              </Link>
            </div>
            {club.walletEnabled && (
              <Link href={`/${tenantSlug}/club/lookup`} className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold" style={muted}>
                <Wallet size={15} aria-hidden /> {t.wallet}
              </Link>
            )}
          </section>
        )}

        {/* Datos del local */}
        {hasPlaceInfo && (
          <section className={card} style={cardStyle} aria-label={tenantName}>
            <div className="mb-3 flex min-w-0 items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- el logo puede venir de cualquier host del comercio (igual que el header)
                <img src={logoUrl} alt="" width={46} height={46} loading="lazy" className="h-[46px] w-[46px] shrink-0 rounded-[14px] object-contain" style={{ background: 'var(--club-chip)' }} />
              ) : (
                <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] text-lg font-extrabold" style={{ background: 'var(--club-fg)', color: 'var(--club-card)' }}>
                  {tenantName.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[17px] font-extrabold leading-tight">{tenantName}</p>
              </div>
            </div>

            <div className="grid">
              {location.address && (
                <div className="flex items-start gap-3 border-t py-[11px]" style={{ borderColor: 'var(--club-line)' }}>
                  <MapPin size={18} className="mt-px shrink-0" style={{ color: 'var(--club-brand)' }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug">{location.address}</p>
                    {mapsHref && (
                      <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: 'var(--club-deep)' }}>
                        {t.directions} <ArrowRight size={14} aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              )}
              {location.phone && (
                <div className="flex items-start gap-3 border-t py-[11px]" style={{ borderColor: 'var(--club-line)' }}>
                  <Phone size={18} className="mt-px shrink-0" style={{ color: 'var(--club-brand)' }} aria-hidden />
                  <a href={`tel:${location.phone.replace(/[^\d+]/g, '')}`} className="text-[13.5px] leading-snug">{location.phone}</a>
                </div>
              )}
              {location.hours && (
                <div className="flex items-start gap-3 border-t py-[11px]" style={{ borderColor: 'var(--club-line)' }}>
                  <Clock size={18} className="mt-px shrink-0" style={{ color: 'var(--club-brand)' }} aria-hidden />
                  <div className="min-w-0">
                    <p className="whitespace-pre-line text-[13.5px] leading-snug">{location.hours}</p>
                    <p className="text-xs" style={muted}>{t.hours}</p>
                  </div>
                </div>
              )}
            </div>

            {about && (
              <div className="border-t pt-3" style={{ borderColor: 'var(--club-line)' }}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={muted}>{t.ourStory}</p>
                <p className="line-clamp-4 text-[13.5px] leading-relaxed">{about}</p>
              </div>
            )}

            {socials.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {socials.map(({ key, href, label, Icon }) => (
                  <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl px-3 text-[13px] font-semibold" style={{ background: 'var(--club-chip)' }}>
                    <Icon size={17} className="shrink-0" aria-hidden /> <span className="truncate">{label}</span>
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Red TakeasyGO: presencia discreta; el naranja queda solo en el sello. */}
        <section className="grid gap-3 rounded-[22px] border border-dashed px-4 py-[18px]" style={{ borderColor: 'var(--club-line)' }} aria-label="TakeasyGO">
          <div className="flex items-center gap-2.5">
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px_10px_10px_2px] text-[15px] font-extrabold text-white" style={{ background: '#F74211' }} aria-hidden>T</span>
            <p className="text-[13px] leading-snug" style={muted}><b style={{ color: 'var(--club-fg)' }}>{tenantName}</b> {t.networkOf}</p>
          </div>
          <p className="text-[17px] font-extrabold leading-tight">{t.discover}</p>
          <a
            href="https://takeasygo.com/app"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackNetworkCta('app', tenantSlug)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border-[1.5px] px-4 text-[13.5px] font-bold transition-opacity hover:opacity-80"
            style={{ borderColor: 'var(--club-line)' }}
          >
            <Smartphone size={17} style={{ color: '#F74211' }} aria-hidden /> {t.getApp}
          </a>
          <p className="text-center text-[12.5px]" style={muted}>
            {t.haveBusiness}{' '}
            <a
              href={registerUrl(tenantSlug)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackNetworkCta('register', tenantSlug)}
              className="font-bold underline underline-offset-[3px]"
              style={{ color: 'var(--club-fg)' }}
            >
              {t.joinNetwork}
            </a>
          </p>
        </section>

        <div className="flex items-center justify-between gap-2.5 px-1 pt-1.5 text-[11.5px]" style={muted}>
          <span>© <span suppressHydrationWarning>{new Date().getFullYear()}</span> {tenantName}</span>
          <Link href={`/${tenantSlug}/admin`} className="opacity-35 transition-opacity hover:opacity-80" title={t.admin} aria-label={t.admin}>
            <Settings size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </footer>
  )
}
