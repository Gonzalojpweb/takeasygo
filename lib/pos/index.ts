/**
 * lib/pos/index.ts
 *
 * Factory de conectores POS.
 * El resto del sistema importa desde aquí — nunca importa un conector directamente.
 * Esto permite agregar nuevos POS sin tocar los route handlers.
 *
 * Uso:
 *   import { getPOSConnector } from '@/lib/pos'
 *   const connector = getPOSConnector('fudo')
 *   const result = await connector.injectOrder(payload, credentials)
 */

import { FudoConnector } from './fudo-connector'
import { BistrosoftConnector } from './bistrosoft-connector'
import type { POSConnector, POSProvider } from './types'

const CONNECTORS: Record<POSProvider, POSConnector> = {
  fudo:       FudoConnector,
  bistrosoft: BistrosoftConnector,
}

/**
 * Devuelve el conector para el proveedor indicado.
 * Lanza un error si el proveedor no está soportado.
 */
export function getPOSConnector(provider: POSProvider): POSConnector {
  const connector = CONNECTORS[provider]
  if (!connector) {
    throw new Error(`Proveedor POS no soportado: "${provider}"`)
  }
  return connector
}

export type { POSConnector, POSProvider, POSCredentials, POSCatalogItem, POSOrderPayload, POSOrderResult, POSWebhookPayload } from './types'
