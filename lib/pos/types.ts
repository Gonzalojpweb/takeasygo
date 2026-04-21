/**
 * lib/pos/types.ts
 *
 * Tipos e interfaces genéricas para el sistema de integración POS.
 * Cada conector (FUDO, BISTROSOFT, etc.) implementa la interfaz POSConnector.
 * Los route handlers nunca importan un conector específico — usan el factory.
 */

// ── Credenciales de acceso al POS ─────────────────────────────────────────────

export interface POSCredentials {
  clientId: string
  clientSecret: string
  apiEndpoint?: string | null  // URL base override (si el POS permite instancias custom)
}

// ── Catálogo de productos del POS ─────────────────────────────────────────────

export interface POSCatalogItem {
  posItemId: string
  name: string
  price: number
  categoryName: string
  available: boolean
}

// ── Payload que TakeasyGO envía al POS al inyectar un pedido ─────────────────

export interface POSOrderItem {
  posItemId: string           // ID del producto en el POS (del mapeo)
  name: string                // Nombre del producto (fallback si el POS acepta por nombre)
  quantity: number
  unitPrice: number
  notes?: string
  modifiers?: {
    name: string
    extraPrice: number
  }[]
}

export interface POSOrderPayload {
  externalId: string          // orderNumber de TakeasyGO (ej: REST-20260421-042)
  customer: {
    name: string
    phone?: string
  }
  type: 'takeaway' | 'delivery' | 'dine_in'
  items: POSOrderItem[]
  notes?: string
  total: number
  paymentMethod: 'mercadopago' | 'cash' | 'card'
  paymentStatus: 'approved' | 'pending'
}

// ── Resultado de la inyección ─────────────────────────────────────────────────

export interface POSOrderResult {
  success: boolean
  posOrderId: string | null   // ID que el POS le asignó al pedido
  error: string | null        // Descripción del error si success === false
  rawResponse?: unknown       // Respuesta cruda del POS para debugging
}

// ── Estado de un pedido en el POS ────────────────────────────────────────────

export type POSOrderStatus =
  | 'received'
  | 'confirmed'
  | 'rejected'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'closed'
  | 'unknown'

// ── Interfaz genérica del conector (implementada por cada POS) ────────────────

export interface POSConnector {
  /**
   * Verifica que las credenciales sean válidas haciendo una llamada de prueba al POS.
   * Devuelve true si la conexión es exitosa.
   */
  testConnection(credentials: POSCredentials): Promise<boolean>

  /**
   * Obtiene el catálogo de productos del POS.
   * Se usa para mostrar el dropdown de mapeo de productos en el panel admin.
   */
  getCatalog(credentials: POSCredentials): Promise<POSCatalogItem[]>

  /**
   * Inyecta un pedido en el POS.
   * Se llama automáticamente después de que MercadoPago aprueba el pago.
   */
  injectOrder(order: POSOrderPayload, credentials: POSCredentials): Promise<POSOrderResult>

  /**
   * Mapea un evento webhook del POS a un estado de TakeasyGO.
   * Cada POS usa nombres distintos para los mismos estados.
   */
  mapEventToOrderStatus(event: string): import('@/models/Order').OrderStatus | null
}

// ── Eventos de webhook que el POS envía a TakeasyGO ──────────────────────────

export interface POSWebhookPayload {
  event: string                // Nombre del evento en la nomenclatura del POS
  orderId: string              // ID del pedido en el POS
  externalOrderId: string      // orderNumber de TakeasyGO
  timestamp: string            // ISO 8601
}

// ── Proveedores disponibles ───────────────────────────────────────────────────

export type POSProvider = 'fudo' | 'bistrosoft'
