import { cn } from '@/lib/utils'
import { itemInitial } from '@/lib/menu-layout'

/**
 * Reemplazo de foto para productos sin imagen en grilla y carrusel:
 * el logo del local si existe; si no, la inicial del plato.
 */
export function ItemImageFallback({
  name,
  logoUrl,
  primary,
  className,
}: {
  name: string
  logoUrl?: string
  primary: string
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('flex w-full items-center justify-center overflow-hidden', className)}
      style={{ background: `linear-gradient(135deg, ${primary}14, ${primary}26)` }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- el logo puede venir de cualquier host del comercio
        <img src={logoUrl} alt="" className="max-h-[55%] max-w-[60%] object-contain opacity-60" loading="lazy" />
      ) : (
        <span className="text-5xl font-black leading-none" style={{ color: primary, opacity: 0.45 }}>
          {itemInitial(name)}
        </span>
      )}
    </div>
  )
}
