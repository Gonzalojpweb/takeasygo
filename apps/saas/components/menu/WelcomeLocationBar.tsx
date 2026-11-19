'use client'

import { Share } from 'lucide-react'
import { toast } from 'sonner'
import LocationBar from '@/components/menu/LocationBar'

interface Props {
  tenantSlug: string
  tenantName: string
  /** Segmento de la sede en la dirección (slug o _id), el mismo que usa Founder Links. */
  locationSegment: string
  location: { _id: string; name: string; address?: string }
}

/**
 * Link que se comparte desde la portada de la sede.
 *
 * Es EXACTAMENTE el link «Menú Home» que arma Founder Links en el superadmin
 * (`/{tenant}/menu/{sede}?source=tgo-customer`): SourceTracker guarda el
 * source en la sesión y el pedido lo lleva en `order.source`, así el panel
 * marca el pedido como «Founder Link» y la analítica de tráfico lo cuenta.
 * Si cambia el formato en FounderLinksGenerator, cambiarlo acá también.
 */
export function buildShareUrl(origin: string, tenantSlug: string, locationSegment: string) {
  return `${origin}/${tenantSlug}/menu/${locationSegment}?source=tgo-customer`
}

export default function WelcomeLocationBar({ tenantSlug, tenantName, locationSegment, location }: Props) {
  async function handleShare() {
    const url = buildShareUrl(window.location.origin, tenantSlug, locationSegment)
    const shareData = {
      title: tenantName,
      text: `Mirá ${tenantName} (${location.name})`,
      url,
    }

    try {
      if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData)
        return
      }
    } catch (err) {
      // El usuario cerró la hoja de compartir: no es un error.
      if ((err as DOMException)?.name === 'AbortError') return
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado')
    } catch {
      toast.error('No pudimos copiar el link')
    }
  }

  return (
    <div className="mh-topbar">
      <LocationBar tenantSlug={tenantSlug} location={location} variant="hero" />
      <button type="button" onClick={handleShare} className="mh-pill" aria-label={`Compartir ${tenantName}`}>
        <Share size={13} aria-hidden />
        Compartir
      </button>
    </div>
  )
}
