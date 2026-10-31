import { MapPin, ShoppingBag, Truck, Utensils, Briefcase } from 'lucide-react'
import { menuHref } from '@/lib/menu/location-ref'

// ============================================================================
// Selector de sede — «Elegí dónde querés hacer tu pedido»
// ============================================================================
// Lo ven los clientes de un comercio con varias sedes cuando entran por el
// link general (/kekelarry o /kekelarry/menu, p. ej. desde Instagram o un QR
// sin sede). Conserva la query del link (?source=qr, promo…) para que las
// estadísticas y las promos sigan funcionando.
// ============================================================================

const MODE_ICONS: Record<string, React.ElementType> = {
  takeaway: ShoppingBag,
  delivery: Truck,
  'dine-in': Utensils,
  business: Briefcase,
}

const MODE_LABELS: Record<string, string> = {
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  'dine-in': 'En el local',
  business: 'Empresarial',
}

export interface PickerLocation {
  _id: string
  slug?: string
  name: string
  address?: string
  orderModes?: string[]
}

export default function LocationPicker({
  tenantSlug,
  tenantName,
  locations,
  query = '',
}: {
  tenantSlug: string
  tenantName: string
  locations: PickerLocation[]
  /** Query del link original, sin «?» (se agrega a cada sede). */
  query?: string
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6" style={{ backgroundColor: 'var(--tgo-surface-0, #E7E2E3)' }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--tgo-text-primary, #2D2A4B)' }}>
          {tenantName}
        </h1>
        <p className="text-sm" style={{ color: 'var(--tgo-text-muted, #98A2B3)' }}>
          Elegí la sede donde querés hacer tu pedido
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {locations.map((loc) => {
          const modes = loc.orderModes?.length ? loc.orderModes : ['takeaway']
          return (
            <a
              key={loc._id}
              href={`${menuHref(tenantSlug, loc)}${query ? `?${query}` : ''}`}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    {modes.map((mode) => {
                      const Icon = MODE_ICONS[mode] || ShoppingBag
                      return (
                        <span
                          key={mode}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                          style={{ backgroundColor: 'var(--tgo-surface-1, #ECEAE9)', color: 'var(--tgo-text-secondary, #4E5067)' }}
                        >
                          <Icon size={10} />
                          {MODE_LABELS[mode] ?? mode}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <span className="text-lg mt-1 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--tgo-text-muted, #98A2B3)' }} aria-hidden>
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
