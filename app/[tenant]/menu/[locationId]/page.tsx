import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { notFound } from 'next/navigation'
import Link from 'next/link'

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

  const modes = location.settings?.orderModes || ['takeaway']
  const branding = tenant.branding

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}
    >
      {/* Logo / Nombre */}
      <div className="text-center mb-12">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={tenant.name} className="h-16 object-contain mx-auto mb-4" />
        ) : (
          <h1 className="text-4xl font-black tracking-tight" style={{ color: branding.primaryColor }}>
            {tenant.name}
          </h1>
        )}
        <p className="text-sm opacity-60 mt-2">{location.name}</p>
      </div>

      {/* Selector de modo */}
      <div className="w-full max-w-xs space-y-3">
        <p className="text-center text-sm opacity-50 mb-6 uppercase tracking-widest text-xs">
          ¿Cómo querés pedir?
        </p>

        {modes.includes('dine-in') && (
          <Link href={`/${tenantSlug}/menu/${locationId}/dine-in`}>
            <div
              className="w-full py-5 px-6 rounded-2xl border-2 text-center font-semibold text-lg cursor-pointer transition-all hover:scale-105"
              style={{
                borderColor: branding.primaryColor,
                color: branding.primaryColor,
              }}
            >
              🍽️ Consumir aquí
            </div>
          </Link>
        )}

        {modes.includes('takeaway') && (
          <Link href={`/${tenantSlug}/menu/${locationId}/takeaway`}>
            <div
              className="w-full py-5 px-6 rounded-2xl text-center font-semibold text-lg cursor-pointer transition-all hover:scale-105"
              style={{
                backgroundColor: branding.primaryColor,
                color: branding.backgroundColor,
              }}
            >
              🥡 Para llevar
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
