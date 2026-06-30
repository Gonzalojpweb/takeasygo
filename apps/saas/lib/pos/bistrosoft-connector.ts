/**
 * lib/pos/bistrosoft-connector.ts
 *
 * PLACEHOLDER — Conector para BISTROSOFT POS.
 *
 * Estado: No implementado.
 * BISTROSOFT no tiene documentación pública de API de inyección de pedidos.
 * Este conector se completará una vez que se concrete el acuerdo comercial
 * con el equipo técnico de BISTROSOFT (contacto: ventas@bistrosoft.com).
 *
 * Ver TECNICAL/INTEGRACIONES.MD → Sección 5 para el plan de contacto.
 *
 * La estructura del archivo ya respeta la interfaz POSConnector para
 * facilitar la implementación futura sin cambiar la arquitectura central.
 */

import type {
  POSConnector,
  POSCredentials,
  POSCatalogItem,
  POSOrderPayload,
  POSOrderResult,
} from './types'
import type { OrderStatus } from '@/models/Order'

const NOT_IMPLEMENTED = new Error(
  'BISTROSOFT: integración no implementada. ' +
  'Requiere acuerdo comercial con BISTROSOFT. ' +
  'Ver TECNICAL/INTEGRACIONES.MD → Sección 5.'
)

export const BistrosoftConnector: POSConnector = {

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async testConnection(_credentials: POSCredentials): Promise<boolean> {
    throw NOT_IMPLEMENTED
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCatalog(_credentials: POSCredentials): Promise<POSCatalogItem[]> {
    throw NOT_IMPLEMENTED
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async injectOrder(_order: POSOrderPayload, _credentials: POSCredentials): Promise<POSOrderResult> {
    throw NOT_IMPLEMENTED
  },

  mapEventToOrderStatus(_event: string): OrderStatus | null {
    // TODO: mapear eventos de BISTROSOFT cuando se tenga su documentación
    return null
  },
}
