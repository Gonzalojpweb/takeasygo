import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { MapPin, ShoppingBag, Truck, Utensils, Briefcase } from 'lucide-react'

const MODE_ICONS: Record<string, React.ElementType> = {
  takeaway: ShoppingBag,
  delivery: Truck,
  'dine-in': Utensils,
  business: Briefcase,
}

const MODE_LABELS: Record<string, string> = {
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  'dine-in': 'Dine-in',
  business: 'Empresarial',
}

export default async function TenantPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<{ _id: import('mongoose').Types.ObjectId; name?: string }>()
  if (!tenant) notFound()

  // Si solo tiene una sede, redirigir directo al selector de menú
  const locations = await Location.find({ tenantId: tenant._id, isActive: true })
    .select('name address settings.orderModes slug')
    .lean<{ _id: import('mongoose').Types.ObjectId; name: string; address?: string; settings?: { orderModes?: string[] }; slug?: string }[]>()

  if (locations.length === 1) {
    redirect(`/${tenantSlug}/menu/${locations[0]._id}`)
  }

  // Si tiene múltiples sedes, mostrar listado mejorado
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6" style={{ backgroundColor: 'var(--tgo-surface-0, #E7E2E3)' }}>
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--tgo-text-primary, #2D2A4B)' }}>
          {tenant.name || tenantSlug}
        </h1>
        <p className="text-sm" style={{ color: 'var(--tgo-text-muted, #98A2B3)' }}>
          Elegí dónde querés hacer tu pedido
        </p>
      </div>

      {/* Location Cards */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {locations.map((loc) => {
          const modes = loc.settings?.orderModes ?? ['takeaway']
          return (
            <a
              key={loc._id.toString()}
              href={`/${tenantSlug}/menu/${loc._id}`}
              className="group block rounded-2xl p-5 transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
              style={{
                backgroundColor: 'var(--tgo-card, #FBF9F7)',
                border: '1px solid var(--tgo-border, #E0DCDF)',
                boxShadow: 'var(--shadow-card, 0 2px 8px rgba(45, 42, 75, 0.10))',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--tgo-text-primary, #2D2A4B)' }}>
                    {loc.name}
                  </h2>
                  {loc.address && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <MapPin size={12} style={{ color: 'var(--tgo-text-muted, #98A2B3)', flexShrink: 0 }} />
                      <span className="text-xs truncate" style={{ color: 'var(--tgo-text-muted, #98A2B3)' }}>
                        {loc.address}
                      </span>
                    </div>
                  )}
                  {/* Order modes */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {modes.map((mode) => {
                      const Icon = MODE_ICONS[mode] || ShoppingBag
                      return (
                        <span
                          key={mode}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                          style={{
                            backgroundColor: 'var(--tgo-surface-1, #ECEAE9)',
                            color: 'var(--tgo-text-secondary, #4E5067)',
                          }}
                        >
                          <Icon size={10} />
                          {MODE_LABELS[mode] ?? mode}
                        </span>
                      )
                    })}
                  </div>
                </div>
                {/* Arrow */}
                <span
                  className="text-lg mt-1 transition-transform group-hover:translate-x-0.5"
                  style={{ color: 'var(--tgo-text-muted, #98A2B3)' }}
                >
                  →
                </span>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
