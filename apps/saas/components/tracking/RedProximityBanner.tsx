'use client'

interface Props {
  tenantSlug: string
  tenantName: string
}

export default function RedProximityBanner({ tenantSlug, tenantName }: Props) {
  return (
    <div className="rounded-2xl p-6 mb-6 text-center space-y-4"
      style={{ backgroundColor: '#f7421108', border: '1px solid #f7421120' }}>

      {/* Restaurante */}
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest font-bold" style={{ color: '#f74211' }}>
          {tenantSlug}
        </p>
        <p className="text-[11px] opacity-50">
          Pertenece a la Red de la Proximidad
        </p>
      </div>

      {/* Descripción */}
      <p className="text-sm opacity-60 leading-relaxed">
        TGO es la nueva forma de vivir la ciudad. Navegá, encontrá tus lugares favoritos y comprá
        directo al restaurante. Así ayudás a cada establecimiento de tu barrio a mejorar mientras
        disfrutás y vivís la ciudad de la proximidad.
      </p>

      {/* Ciudad */}
      <p className="text-xs font-semibold opacity-40">
        Buenos Aires — Ciudad de los 15 minutos
      </p>

      {/* Divider */}
      <div className="border-t" style={{ borderColor: '#f7421115' }} />

      {/* CTA App */}
      <div className="space-y-3">
        <p className="text-sm font-bold" style={{ color: '#f74211' }}>
          🚀 TGO App — Próximamente
        </p>
        <p className="text-xs opacity-50">
          Registrate para ser de los primeros
        </p>
        <a
          href="https://takeasygo.com/app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#f74211' }}
        >
          TGO APP
        </a>
      </div>
    </div>
  )
}
