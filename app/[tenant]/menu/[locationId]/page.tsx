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
  const hero = location.hero || { mediaType: 'none', url: '' }
  const hasHero = hero.mediaType !== 'none' && !!hero.url

  // ── Fallback layout (no hero configured) ─────────────────────────────────
  if (!hasHero) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}
      >
        <div className="text-center mb-12">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={tenant.name} className="h-[30%] w-[20%] object-cover mx-auto mb-4" />
          ) : (
            <h1 className="text-4xl font-black tracking-tight" style={{ color: branding.primaryColor }}>
              {tenant.name}
            </h1>
          )}
          <p className="text-sm opacity-60 mt-2">{location.name}</p>
        </div>

        <div className="w-full max-w-xs space-y-3">
          <p className="text-center text-sm opacity-50 mb-6 uppercase tracking-widest text-xs">
            ¿Cómo querés pedir?
          </p>
          {modes.includes('dine-in') && (
            <Link href={`/${tenantSlug}/menu/${locationId}/dine-in`}>
              <div
                className="w-full mb-2 py-4 px-4 rounded-2xl border-2 text-center font-semibold text-lg cursor-pointer transition-all hover:scale-105"
                style={{ borderColor: branding.primaryColor, color: branding.primaryColor }}
              >
                🍽️ Consumir aquí
              </div>
            </Link>
          )}
          {modes.includes('takeaway') && (
            <Link href={`/${tenantSlug}/menu/${locationId}/takeaway`}>
              <div
                className="w-full py-4 px-4 rounded-2xl text-center font-semibold text-lg cursor-pointer transition-all hover:scale-105"
                style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}
              >
                🥡 Para llevar
              </div>
            </Link>
          )}
        </div>

        <div className="mt-10 flex justify-center">
          <PoweredByTakeasy variant="dark" label="network" />
        </div>
      </div>
    )
  }

  // ── Hero layout ───────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .mh-root {
          position: relative;
          min-height: 100dvh;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0px 16px;
        }

        /* Blurred background */
        .mh-bg-img {
          position: absolute;
          inset: -60px;
          background-size: contain;
          background-position: center;
          filter: blur(2px) saturate(1);
          // transform: scale(1);
          z-index: 0;
        }
        .mh-bg-video {
          position: absolute;
          inset: -60px;
          width: calc(100% + 120px);
          height: calc(100% + 120px);
          object-fit: cover;
          filter: blur(38px) saturate(1.2);
          transform: scale(1.13);
          z-index: 0;
        }

        /* Subtle dark scrim so content stays legible */
        .mh-scrim {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.26);
          z-index: 1;
        }

        /* Content wrapper */
        .mh-content {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 620px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
        }

        /* Centered media card */
        .mh-card {
          position: relative;
          width: 100%;
          border-radius: 20px;
          overflow: hidden;
          box-shadow:
            0 4px 20px rgba(0,0,0,0.20),
            0 28px 72px rgba(0,0,0,0.44);
        }
        .mh-media {
          width: 100%;
          display: block;
          object-fit: cover;
          max-height: 64vh;
        }

        /* Logo / name gradient overlay at top of card */
        .mh-overlay {
          position: absolute;
          top: 0; left: 0; right: 0;
          padding: 26px 26px 80px;
          background: linear-gradient(180deg, rgba(0,0,0,0.60) 0%, transparent 100%);
          display: flex;
          align-items: flex-start;
          justify-content: center;
        }
        .mh-logo {
          height: 42px;
          object-fit: contain;
          filter: drop-shadow(0 2px 10px rgba(0,0,0,0.4));
        }
        .mh-name {
          color: #fff;
          font-size: clamp(24px, 5vw, 38px);
          font-weight: 900;
          letter-spacing: -0.03em;
          text-shadow: 0 2px 20px rgba(0,0,0,0.55);
          margin: 0;
        }

        /* Location subtitle */
        .mh-sublabel {
          color: rgba(255,255,255,0.60);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin: 0;
        }

        /* Buttons */
        .mh-buttons {
          width: 100%;
          max-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 11px;
        }
        .mh-prompt {
          color: rgba(255,255,255,0.42);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          text-align: center;
          margin: 0 0 2px;
        }
        .mh-btn-outline {
          display: block;
          width: 100%;
          padding: 14px 16px;
          border-radius: 14px;
          border-width: 2px;
          border-style: solid;
          text-align: center;
          font-weight: 700;
          font-size: 15px;
          color: #fff;
          cursor: pointer;
          background: rgba(255,255,255,0.10);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: background 0.2s;
          text-decoration: none;
        }
        .mh-btn-outline:hover { background: rgba(255,255,255,0.20); }
        .mh-btn-solid {
          display: block;
          width: 100%;
          padding: 14px 16px;
          border-radius: 14px;
          border: none;
          text-align: center;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          transition: opacity 0.2s;
          text-decoration: none;
        }
        .mh-btn-solid:hover { opacity: 0.88; }

        @media (min-width: 600px) {
          .mh-root { padding: 32px 24px; }
          .mh-card { border-radius: 26px; }
          .mh-media { max-height: 68vh; }
        }
      `}</style>

      <div className="mh-root">

        {/* ── Blurred background ── */}
        {hero.mediaType === 'image' && (
          <div
            aria-hidden
            className="mh-bg-img"
            style={{ backgroundImage: `url(${hero.url})` }}
          />
        )}
        {hero.mediaType === 'video' && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            aria-hidden
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            src={hero.url}
            className="mh-bg-video"
          />
        )}

        {/* Dark scrim */}
        <div aria-hidden className="mh-scrim" />

        {/* ── Centered content ── */}
        <div className="mh-content">

          {/* Hero card */}
          <div className="mh-card">
            {hero.mediaType === 'image' && (
              <img
                src={hero.url}
                alt={tenant.name}
                className="mh-media"
              />
            )}
            {hero.mediaType === 'video' && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                src={hero.url}
                className="mh-media"
              />
            )}

            {/* Logo / name at top of card */}
            <div className="mh-overlay">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={tenant.name} className="mh-logo" />
              ) : (
                <h1 className="mh-name">{tenant.name}</h1>
              )}
            </div>
          </div>

          {/* Location name */}
          <p className="mh-sublabel">{location.name}</p>

          {/* Order mode buttons */}
          <div className="mh-buttons">
            <p className="mh-prompt">¿Cómo querés pedir?</p>

            {modes.includes('dine-in') && (
              <Link
                href={`/${tenantSlug}/menu/${locationId}/dine-in`}
                className="mh-btn-outline"
                style={{ borderColor: branding.primaryColor }}
              >
                🍽️ Consumir aquí
              </Link>
            )}

            {modes.includes('takeaway') && (
              <Link
                href={`/${tenantSlug}/menu/${locationId}/takeaway`}
                className="mh-btn-solid"
                style={{
                  backgroundColor: branding.primaryColor,
                  color: branding.backgroundColor || '#ffffff',
                }}
              >
                🥡 Para llevar
              </Link>
            )}
          </div>

          <div style={{ marginTop: '8px' }}>
            <PoweredByTakeasy variant="dark" label="network" />
          </div>

        </div>
      </div>
    </>
  )
}
