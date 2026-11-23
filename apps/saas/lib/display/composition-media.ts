// Ilustraciones de una composición: tienen que ser imágenes subidas por el
// flujo firmado a la carpeta de pantallas de ESTE comercio (cuenta ads).
// Una URL pegada de otro sitio u otro comercio se rechaza.
import { adsAssetFromUrl, belongsTo } from '@/lib/media/ads'
import { illustrationUrls, type CompositionConfig } from '@/lib/display/composition-schema'

export function compositionMediaError(config: CompositionConfig, tenantId: string): string | null {
  for (const url of illustrationUrls(config)) {
    const a = adsAssetFromUrl(url)
    if (!a || a.kind !== 'image' || !belongsTo(a.publicId, { kind: 'tenant', tenantId }, 'screen')) {
      return 'La ilustración tiene que ser una imagen subida desde Pantallas. Subila de nuevo.'
    }
  }
  return null
}
