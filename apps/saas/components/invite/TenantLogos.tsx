'use client'

import Image from 'next/image'

interface TenantLogo {
  name: string
  logoUrl: string
}

interface TenantLogosProps {
  tenants: TenantLogo[]
}

export default function TenantLogos({ tenants }: TenantLogosProps) {
  if (tenants.length === 0) return null

  return (
    <div className="animate-fade-in-up pt-4" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
      <p
        className="text-xs text-center font-medium mb-5 uppercase tracking-wider"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        Algunos que ya confían
      </p>

      <div className="flex flex-wrap items-center justify-center gap-6 px-4">
        {tenants.map((tenant, i) => (
          <div
            key={tenant.name}
            className="opacity-40 hover:opacity-60 transition-opacity duration-300"
            style={{ animationDelay: `${0.3 + i * 0.08}s`, animationFillMode: 'both' }}
            title={tenant.name}
          >
            <Image
              src={tenant.logoUrl}
              alt={tenant.name}
              width={64}
              height={24}
              className="h-5 w-auto brightness-0 invert-[.6]"
              unoptimized
            />
          </div>
        ))}
      </div>
    </div>
  )
}
