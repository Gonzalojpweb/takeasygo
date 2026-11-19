import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowUpRight, Building2, CalendarDays, Instagram, MapPin, ShoppingBag, Star, UtensilsCrossed,
} from 'lucide-react'
import PoweredByTakeasy from '@/components/PoweredByTakeasy'
import MenuWithExploreNav from '@/components/menu/MenuWithExploreNav'
import WelcomeBackground from '@/components/menu/WelcomeBackground'
import WelcomeLocationBar from '@/components/menu/WelcomeLocationBar'
import ReturningCustomerBanner from '@/components/menu/ReturningCustomerBanner'
import MenuOpenTracker from '@/components/menu/MenuOpenTracker'
import { locationPathSegment, locationRefFilter } from '@/lib/menu/location-ref'

export const revalidate = 300

export async function generateStaticParams() {
  await connectDB()

  const tenants = await Tenant.find({ isActive: true }).select('slug').lean()
  const tenantsArr = tenants as any[]

  const params = await Promise.all(
    tenantsArr.map(async (tenant) => {
      const locations = await Location.find({
        tenantId: tenant._id,
        isActive: true,
      }).select('slug').lean()

      return (locations as any[]).map((loc) => ({
        tenant: tenant.slug,
        locationId: loc.slug,
      }))
    }),
  )

  return params.flat()
}

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

/** Una acción de la portada: botón ancho con ícono, título, bajada y flecha. */
interface HomeAction {
  key: string
  href: string
  external?: boolean
  icon: React.ElementType
  title: string
  subtitle?: string
}

export default async function MenuSelectorPage({ params }: Props) {
  const { tenant: tenantSlug, locationId: locationRef } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
  if (!tenant || !isTenantPubliclyOperational(tenant)) notFound()

  const locationDoc = await Location.findOne({ ...locationRefFilter(locationRef), tenantId: tenant._id, isActive: true }).lean() as any
  if (!locationDoc) notFound()
  // La dirección trae el slug; adentro se trabaja con el _id de siempre.
  const locationId = String(locationDoc._id)
  const locationSegment = locationPathSegment(locationDoc)
  const location = JSON.parse(JSON.stringify(locationDoc))

  const modes: string[] = location.settings?.orderModes || ['takeaway']
  const branding = tenant.branding
  const profile = tenant.profile || {}
  const hero = location.hero || { mediaType: 'none', url: '' }
  const hasHero = hero.mediaType !== 'none' && !!hero.url
  const isOpen = location.settings?.acceptsOrders !== false

  const instagramHandle = String(profile.social?.instagram || '').trim().replace(/^@/, '')
  const address = String(location.address || '').trim()
  const mapsUrl = String(location.mapsUrl || '').trim()
    || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${tenant.name}`)}` : '')
  // Reseñas de Google: se carga por sede en Configuración → Google Business.
  // Reemplaza a WhatsApp en la portada para no sacar al cliente antes de pedir.
  const reviewUrl = String(location.googleBusiness?.reviewUrl || '').trim()
  const hours = String(location.hours || '').trim()

  const businessEnabled = tenant.business?.enabled === true

  // Show reservations button if tenant module is enabled and location hasn't explicitly disabled it
  const reservationsEnabled =
    tenant.features?.reservations === true &&
    location.reservationConfig?.enabled !== false

  const timeSlots: string[] = Array.isArray(location.reservationConfig?.timeSlots)
    ? location.reservationConfig.timeSlots.filter(Boolean)
    : []
  const reservationSubtitle = timeSlots.length === 1
    ? `Único turno a las ${timeSlots[0]}`
    : 'Elegí día y horario'

  const orderSubtitle = modes.includes('delivery') ? 'Take away y delivery' : 'Pedí y retirá sin esperar'

  // ── Acciones, en orden de prioridad. La primera va en el color de la marca. ──
  const actions: HomeAction[] = []
  if (modes.includes('takeaway')) {
    actions.push({
      key: 'takeaway',
      href: `/${tenantSlug}/menu/${locationSegment}/takeaway`,
      icon: ShoppingBag,
      title: 'Hacé tu pedido',
      subtitle: orderSubtitle,
    })
  }
  if (reservationsEnabled) {
    actions.push({
      key: 'reservas',
      href: `/${tenantSlug}/reservas/${locationId}`,
      icon: CalendarDays,
      title: 'Reservas',
      subtitle: reservationSubtitle,
    })
  }
  if (modes.includes('dine-in')) {
    actions.push({
      key: 'dine-in',
      href: `/${tenantSlug}/menu/${locationSegment}/dine-in`,
      icon: UtensilsCrossed,
      title: 'Menú',
      subtitle: 'Platos, postres y bebidas',
    })
  }
  if (businessEnabled) {
    actions.push({
      key: 'business',
      href: `/${tenantSlug}/menu/${locationSegment}/business`,
      icon: Building2,
      title: 'Business',
      subtitle: 'Pedidos para empresas',
    })
  }
  if (mapsUrl) {
    actions.push({
      key: 'ubicacion',
      href: mapsUrl,
      external: true,
      icon: MapPin,
      title: 'Ubicación',
      subtitle: address || location.name,
    })
  }

  const radius = branding.borderRadius === 'sharp' ? '6px' : '14px'
  const statusLabel = tenant.isOperational === false ? 'Catálogo disponible' : (isOpen ? 'Abierto ahora' : 'Cerrado')
  const statusKind = tenant.isOperational === false ? 'catalog' : (isOpen ? 'open' : 'closed')

  return (
    <MenuWithExploreNav tenantSlug={tenantSlug}>
      <MenuOpenTracker locationId={locationId} />
      <style>{`
        .mh-root {
          --mh-radius: ${radius};
          --mh-primary: ${branding.primaryColor || '#f74211'};
          position: relative;
          min-height: 100dvh;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 18px);
          color: #fff;
        }
        /* Con sesión iniciada aparece la barra de la app (h 64 + 10 de aire
           + safe area). Se reserva ese alto para que el pie no quede debajo. */
        .has-nav .mh-root {
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
        }

        /* ── Fondo ── */
        .mh-bg-color { position: absolute; inset: 0; z-index: 0; }
        .mh-bg-container { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
        .mh-bg-media {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; object-position: center;
          filter: blur(3px) saturate(1.05);
          transform: scale(1.05);
          z-index: 0;
        }
        /* Más oscuro abajo, donde van los botones y el texto chico. */
        .mh-scrim {
          position: absolute; inset: 0; z-index: 1;
          background: linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.30) 38%, rgba(0,0,0,0.62) 72%, rgba(0,0,0,0.80) 100%);
        }
        @media (max-width: 480px) {
          .mh-bg-media { filter: blur(2px) saturate(1); transform: scale(1.03); }
        }

        /* ── Barra superior: sede + compartir ── */
        .mh-topbar {
          position: relative; z-index: 20;
          width: 100%; max-width: 400px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .mh-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px;
          border-radius: 99px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          color: #fff;
          background: rgba(0,0,0,0.28);
          border: 1px solid rgba(255,255,255,0.38);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          cursor: pointer; white-space: nowrap;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .mh-pill:hover { background: rgba(0,0,0,0.45); }
        .mh-pill:active { transform: scale(0.97); }

        .mh-banner { position: relative; z-index: 15; width: 100%; max-width: 400px; margin-top: 12px; }
        .mh-banner:empty { display: none; }

        /* ── Marca: logo + bajada + estado, centrado en el espacio libre ── */
        .mh-brand {
          position: relative; z-index: 10;
          flex: 1;
          width: 100%; max-width: 400px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px;
          text-align: center;
          padding: 20px 0 24px;
        }
        .mh-logo {
          height: 24dvh; max-height: 170px; max-width: 240px;
          object-fit: contain;
          filter: drop-shadow(0 4px 16px rgba(0,0,0,0.5));
        }
        .has-nav .mh-logo { height: 18dvh; max-height: 130px; }
        .mh-name {
          font-size: clamp(28px, 8vw, 40px); font-weight: 900;
          letter-spacing: -0.03em; line-height: 1.05;
          text-shadow: 0 2px 24px rgba(0,0,0,0.6);
        }
        .mh-tagline {
          color: rgba(255,255,255,0.75);
          font-size: 13px; font-weight: 500; font-style: italic;
          max-width: 280px; line-height: 1.4;
        }
        .mh-badge {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 4px 12px 4px 9px; border-radius: 9999px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
        }
        .mh-badge-open    { background: rgba(34,197,94,0.18);  border: 1px solid rgba(34,197,94,0.35);  color: #86efac; }
        .mh-badge-closed  { background: rgba(239,68,68,0.18);  border: 1px solid rgba(239,68,68,0.35);  color: #fca5a5; }
        .mh-badge-catalog { background: rgba(245,158,11,0.18); border: 1px solid rgba(245,158,11,0.35); color: #fcd34d; }
        .mh-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .mh-dot-open    { background: #22c55e; animation: mh-pulse 1.8s infinite; }
        .mh-dot-closed  { background: #ef4444; }
        .mh-dot-catalog { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
        @keyframes mh-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.7); }
          70%  { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        .mh-soon {
          font-size: 10px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #fcd34d;
        }

        /* ── Acciones ── */
        .mh-actions {
          position: relative; z-index: 10;
          width: 100%; max-width: 400px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .mh-btn {
          display: flex; align-items: center; gap: 14px;
          width: 100%; min-height: 58px;
          padding: 10px 16px 10px 18px;
          border-radius: var(--mh-radius);
          color: #fff; text-decoration: none; text-align: left;
          transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .mh-btn:active { transform: scale(0.98); }
        .mh-btn-primary {
          background: var(--mh-primary);
          border: 1.5px solid transparent;
          box-shadow: 0 10px 30px -8px color-mix(in srgb, var(--mh-primary) 70%, transparent);
        }
        .mh-btn-primary:hover { opacity: 0.92; }
        .mh-btn-glass {
          background: rgba(0,0,0,0.30);
          border: 1.5px solid rgba(255,255,255,0.55);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        }
        .mh-btn-glass:hover { background: rgba(0,0,0,0.45); }
        .mh-btn-icon { width: 20px; height: 20px; flex-shrink: 0; }
        .mh-btn-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .mh-btn-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; }
        .mh-btn-sub {
          font-size: 12px; font-weight: 400; line-height: 1.3; opacity: 0.78;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .mh-btn-arrow { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.8; }

        /* Fila de dos: Instagram + Reseñas de Google */
        .mh-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; }
        .mh-btn-half {
          justify-content: center; gap: 8px;
          min-height: 48px; padding: 10px 12px;
          border-radius: 9999px;
          font-size: 14px; font-weight: 600;
        }
        .mh-btn-half .mh-btn-icon { width: 17px; height: 17px; }

        /* ── Pie: horario + @instagram, y sello de red ── */
        .mh-foot {
          position: relative; z-index: 10;
          width: 100%; max-width: 400px;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding-top: 16px;
        }
        .mh-meta {
          width: 100%;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          font-size: 10.5px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(255,255,255,0.62);
        }
        .mh-meta-hours { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mh-meta a { color: inherit; text-decoration: none; flex-shrink: 0; }
        .mh-meta a:hover { color: #fff; }
        .mh-meta-only { justify-content: center; }

        /* Pantallas bajas (o con la barra de la app): todo un poco más compacto */
        @media (max-height: 760px) {
          .mh-brand { padding: 12px 0 16px; gap: 8px; }
          .mh-logo { height: 18dvh; }
          .has-nav .mh-logo { height: 14dvh; }
          .mh-actions { gap: 8px; }
          .mh-btn { min-height: 52px; padding-top: 8px; padding-bottom: 8px; }
          .mh-btn-half { min-height: 44px; }
          .mh-foot { padding-top: 12px; gap: 10px; }
        }
        @media (max-height: 640px) {
          .mh-btn-sub { display: none; }
          .mh-btn { min-height: 46px; }
          .mh-tagline { display: none; }
        }
      `}</style>

      <div className="mh-root">

        {/* ── Fondo ── */}
        <WelcomeBackground
          hero={hero}
          hasHero={hasHero}
          backgroundColor={branding.backgroundColor}
        />
        <div aria-hidden className="mh-scrim" style={!hasHero ? { background: 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.45))' } : undefined} />

        {/* ── Arriba: sede + compartir ── */}
        <WelcomeLocationBar
          tenantSlug={tenantSlug}
          tenantName={tenant.name}
          locationSegment={locationSegment}
          location={location}
        />

        <div className="mh-banner">
          <ReturningCustomerBanner tenantSlug={tenantSlug} />
        </div>

        {/* ── Marca ── */}
        <div className="mh-brand">
          {hero.showLogo !== false && (
            branding.logoUrl ? (
              <img src={branding.logoUrl} alt={tenant.name} className="mh-logo" />
            ) : (
              <h1 className="mh-name" style={!hasHero ? { color: branding.textColor } : undefined}>
                {tenant.name}
              </h1>
            )
          )}

          {profile.menuDescription ? (
            <p className="mh-tagline" style={!hasHero ? { color: branding.textColor, opacity: 0.7 } : undefined}>
              {profile.menuDescription}
            </p>
          ) : null}

          <div className={`mh-badge mh-badge-${statusKind}`}>
            <span className={`mh-dot mh-dot-${statusKind}`} />
            {statusLabel}
          </div>
          {tenant.isOperational === false && <p className="mh-soon">Próximamente takeaway</p>}
        </div>

        {/* ── Acciones ── */}
        <nav className="mh-actions" aria-label={`Opciones de ${tenant.name}`}>
          {actions.map((action, i) => {
            const Icon = action.icon
            const className = `mh-btn ${i === 0 ? 'mh-btn-primary' : 'mh-btn-glass'}`
            const content = (
              <>
                <Icon className="mh-btn-icon" aria-hidden />
                <span className="mh-btn-text">
                  <span className="mh-btn-title">{action.title}</span>
                  {action.subtitle && <span className="mh-btn-sub">{action.subtitle}</span>}
                </span>
                <ArrowUpRight className="mh-btn-arrow" aria-hidden />
              </>
            )
            return action.external ? (
              <a key={action.key} href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
                {content}
              </a>
            ) : (
              <Link key={action.key} href={action.href} className={className}>
                {content}
              </Link>
            )
          })}

          {(instagramHandle || reviewUrl) && (
            <div className="mh-row">
              {instagramHandle && (
                <a
                  href={`https://instagram.com/${instagramHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mh-btn mh-btn-glass mh-btn-half"
                >
                  <Instagram className="mh-btn-icon" aria-hidden />
                  Instagram
                </a>
              )}
              {reviewUrl && (
                <a
                  href={reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mh-btn mh-btn-glass mh-btn-half"
                >
                  <Star className="mh-btn-icon" aria-hidden />
                  Reseñas
                </a>
              )}
            </div>
          )}
        </nav>

        {/* ── Pie ── */}
        <div className="mh-foot">
          {(hours || instagramHandle) && (
            <div className={`mh-meta ${hours && instagramHandle ? '' : 'mh-meta-only'}`}>
              {hours && <span className="mh-meta-hours">{hours}</span>}
              {instagramHandle && (
                <a href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noopener noreferrer">
                  @{instagramHandle}
                </a>
              )}
            </div>
          )}
          <PoweredByTakeasy variant="dark" label="network" tenantSlug={tenantSlug} />
        </div>
      </div>
    </MenuWithExploreNav>
  )
}
