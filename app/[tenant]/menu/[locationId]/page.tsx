import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PoweredByTakeasy from '@/components/PoweredByTakeasy'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function MenuSelectorPage({ params }: Props) {
  const { tenant: tenantSlug, locationId } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true }).lean() as any
  if (!location) notFound()

  const modes: string[] = location.settings?.orderModes || ['takeaway']
  const branding = tenant.branding
  const profile = tenant.profile || {}
  const hero = location.hero || { mediaType: 'none', url: '' }
  const hasHero = hero.mediaType !== 'none' && !!hero.url
  const isOpen = location.settings?.acceptsOrders !== false

  const instagram = profile.social?.instagram || ''
  const phone = location.phone || ''
  const mapsUrl = location.mapsUrl || ''
  const behance = profile.branding?.behance || ''

  // Show reservations button if tenant module is enabled and location hasn't explicitly disabled it
  const reservationsEnabled =
    tenant.features?.reservations === true &&
    location.reservationConfig?.enabled !== false

  // Compute border radius value from branding
  const br = branding.borderRadius === 'pill' ? '10px' : branding.borderRadius === 'sharp' ? '4px' : '10px'

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .mh-root {
          position: relative;
          min-height: 100dvh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 20px 24px;
          gap: 0;
        }

        /* ── Backgrounds ── */
        .mh-bg-color {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .mh-bg-img {
          position: absolute;
          inset: -60px;
          background-size: cover;
          background-position: center;
          filter: blur(2px) saturate(1);
          transform: scale(1.1);
          z-index: 0;
        }
        .mh-bg-video {
          position: absolute;
          inset: -60px;
          width: calc(100% + 120px);
          height: calc(100% + 120px);
          object-fit: cover;
          filter: blur(28px) saturate(1.2);
          transform: scale(1.1);
          z-index: 0;
        }
        .mh-scrim {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.48);
          z-index: 1;
        }

        /* ── Content ── */
        .mh-content {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          flex: 1;
          justify-content: center;
        }

        /* ── Header: logo + name + tagline + badge ── */
        .mh-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
          margin-bottom: 36px;
        }
        .mh-logo {
          height: 72px;
          max-width: 180px;
          object-fit: contain;
          filter: drop-shadow(0 4px 16px rgba(0,0,0,0.5));
        }
        .mh-name {
          color: #fff;
          font-size: clamp(26px, 7vw, 36px);
          font-weight: 900;
          letter-spacing: -0.03em;
          line-height: 1.1;
          text-shadow: 0 2px 24px rgba(0,0,0,0.6);
        }
        .mh-tagline {
          color: rgba(255,255,255,0.65);
          font-size: 13px;
          font-weight: 500;
          font-style: italic;
          letter-spacing: 0.01em;
          max-width: 260px;
          line-height: 1.4;
        }
        .mh-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 14px 5px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          margin-top: 4px;
        }
        .mh-badge-open {
          background: rgba(34, 197, 94, 0.18);
          border: 1px solid rgba(34, 197, 94, 0.35);
          color: #86efac;
        }
        .mh-badge-closed {
          background: rgba(239, 68, 68, 0.18);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #fca5a5;
        }
        .mh-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .mh-dot-open {
          background: #22c55e;
          box-shadow: 0 0 0 0 rgba(34,197,94,0.7);
          animation: mh-pulse 1.8s infinite;
        }
        .mh-dot-closed {
          background: #ef4444;
        }
        @keyframes mh-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.7); }
          70%  { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }

        /* ── Buttons ── */
        .mh-buttons {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .mh-btn {
          display: flex;
          border-radius: 10px;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 12px 15px;
          font-size: 14px;
          font-weight: 300;
          letter-spacing: 0.01em;
          cursor: pointer;
          text-decoration: none;
          transition: transform 0.15s ease, opacity 0.15s ease;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .mh-btn:active { transform: scale(0.97); }

        .mh-btn-primary {
          border: none;
          color: #fff;
        }
        .mh-btn-glass {
          background: rgba(255,255,255,0.12);
          border: 1.5px solid rgba(255,255,255,0.22);
          color: #fff;
        }
        .mh-btn-glass:hover { background: rgba(255,255,255,0.20); }
        .mh-btn-primary:hover { opacity: 0.88; }

        /* ── Footer social ── */
        .mh-footer {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding-top: 28px;
          width: 100%;
        }
        .mh-social {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .mh-social-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255,255,255,0.12);
          border: 1.5px solid rgba(255,255,255,0.22);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #fff;
          text-decoration: none;
          transition: background 0.15s, transform 0.15s;
          flex-shrink: 0;
        }
        .mh-social-btn:hover {
          background: rgba(255,255,255,0.22);
          transform: scale(1.08);
        }
        .mh-social-btn svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      `}</style>

      <div className="mh-root">

        {/* ── Background ── */}
        {!hasHero && (
          <div className="mh-bg-color" style={{ backgroundColor: branding.backgroundColor }} />
        )}
        {hasHero && hero.mediaType === 'image' && (
          <div className="mh-bg-img" style={{ backgroundImage: `url(${hero.url})` }} aria-hidden />
        )}
        {hasHero && hero.mediaType === 'video' && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video aria-hidden autoPlay muted loop playsInline preload="auto" src={hero.url} className="mh-bg-video" />
        )}
        <div aria-hidden className="mh-scrim" style={!hasHero ? { background: 'rgba(0,0,0,0.15)' } : undefined} />

        {/* ── Main content ── */}
        <div className="mh-content">

          {/* Header */}
          <div className="mh-header">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={tenant.name} className="mh-logo" />
            ) : (
              <h1 className="mh-name" style={!hasHero ? { color: branding.textColor } : undefined}>
                {tenant.name}
              </h1>
            )}

            {profile.menuDescription ? (
              <p className="mh-tagline" style={!hasHero ? { color: branding.textColor, opacity: 0.6 } : undefined}>
                {profile.menuDescription}
              </p>
            ) : null}

            <div className={`mh-badge ${isOpen ? 'mh-badge-open' : 'mh-badge-closed'}`}>
              <span className={`mh-dot ${isOpen ? 'mh-dot-open' : 'mh-dot-closed'}`} />
              {isOpen ? 'Abierto ahora' : 'Cerrado'}
            </div>
          </div>

          {/* Mode buttons */}
          <div className="mh-buttons">
            {modes.includes('dine-in') && (
              <Link
                href={`/${tenantSlug}/menu/${locationId}/dine-in`}
                className="mh-btn mh-btn-glass"
                style={{ borderRadius: br }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, flexShrink: 0, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M3 11l19-9-9 19-2-8-8-2z" />
                </svg>
                Consumir aquí
              </Link>
            )}
            {modes.includes('takeaway') && (
              <Link
                href={`/${tenantSlug}/menu/${locationId}/takeaway`}
                className="mh-btn mh-btn-primary"
                style={{
                  borderRadius: br,
                  backgroundColor: branding.primaryColor,
                  boxShadow: `0 8px 32px ${branding.primaryColor}55`,
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, flexShrink: 0, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                Para llevar
              </Link>
            )}
            {reservationsEnabled && (
              <Link
                href={`/${tenantSlug}/reservas/${locationId}`}
                className="mh-btn mh-btn-glass"
                style={{ borderRadius: br }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, flexShrink: 0, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Reservar mesa
              </Link>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mh-footer">
          {(instagram || phone || mapsUrl || behance) && (
            <div className="mh-social">
              {instagram && (
                <a
                  href={`https://instagram.com/${instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mh-social-btn"
                  aria-label="Instagram"
                >
                  {/* Instagram icon */}
                  <svg viewBox="0 0 24 24">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                </a>
              )}
              {phone && (
                <a
                  href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mh-social-btn"
                  aria-label="WhatsApp"
                >
                  {/* WhatsApp icon */}
                  <svg viewBox="0 0 24 24">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </a>
              )}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mh-social-btn"
                  aria-label="Ver en Google Maps"
                >
                  {/* Map pin icon */}
                  <svg viewBox="0 0 24 24">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </a>
              )}
              {behance && (
                <a
                  href={behance.startsWith('http') ? behance : `https://behance.net/${behance}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mh-social-btn"
                  aria-label="Behance"
                >
                  {/* Behance icon */}
                  <svg viewBox="0 0 24 24">
                    <path d="M22 7h-7v-2h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 3.082 0 4.964 1.782 5.375 4.426.078.506.109 1.188.095 2.14h-8.027c.13 3.211 3.483 3.312 4.588 2.029h3.168zm-7.686-4h4.965c-.105-1.547-1.136-2.219-2.477-2.219-1.466 0-2.277.768-2.488 2.219zm-9.574 6.988h-6.466v-14.967h6.953c5.476.081 5.58 5.444 2.72 6.906 3.461 1.26 3.577 8.061-3.207 8.061zm-3.466-8.988h3.584c-2.508 0-2.906-3-2.906-3.027 0-2.039 2.507-2.022 2.507-2.022 0 2.584-2.507 2.95-3.185 5.049zm-3.54-6.012h-4.326v14.028h4.326c5.143 0 6.826-3.979 6.826-7.037 0-3.022-1.669-6.991-6.826-6.991z"/>
                  </svg>
                </a>
              )}
            </div>
          )}

          <PoweredByTakeasy variant="dark" label="network" />
        </div>
      </div>
    </>
  )
}
