// ============================================================================
// @takeasygo/types — Modelo de datos completo del ecosistema TakeasyGO POS
// Fuente: TakeasyGO_Arquitectura_v03.md + SECURITYPOS.md + ros.md
// ============================================================================

// ============================================================================
// 1. CORE — Roles, Dispositivos, JWT
// ============================================================================

export type Role = "admin" | "manager" | "cashier" | "waiter" | "kitchen"

export type DeviceType = "hub" | "spoke"

export interface JwtPayload {
  sub: string
  tenantId: string
  role: Role
  deviceType: DeviceType
  iat: number
  exp: number
}

export interface JwtPair {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  deviceType: DeviceType
}

// ============================================================================
// 2. TENANT — Multi-tenancy
// ============================================================================

export interface Tenant {
  id: string
  name: string
  slug: string
  config: TenantConfig
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface TenantConfig {
  fiscalConfig: FiscalConfig
  paymentMethods: PaymentMethod[]
  offlineTimeout: number
  timezone: string
  currency: string
  lan: LANConfig
}

export interface LANConfig {
  port: number
  heartbeatInterval: number
  heartbeatTimeout: number
  maxConnectionsPerHub: number
  tlsEnabled: boolean
}

// ============================================================================
// 3. USER — Usuarios del sistema
// ============================================================================

export interface User {
  id: string
  tenantId: string
  name: string
  email: string
  role: Role
  pin?: string
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

// ============================================================================
// 4. DEVICE — Dispositivos Hub y Spokes
// ============================================================================

export interface DeviceInfo {
  id: string
  tenantId: string
  name: string
  type: DeviceType
  fingerprint: string
  isPaired: boolean
  pairedAt?: Date
  lastSeenAt?: Date
  isBlacklisted: boolean
  blacklistedAt?: Date
  blacklistedBy?: string
}

export interface HubConfig {
  deviceId: string
  tenantId: string
  lanPort: number
  tlsCert?: string
  tlsKey?: string
  jwtPrivateKey?: string
  jwtPublicKey?: string
}

export interface SpokeConfig {
  deviceId: string
  name: string
  hubId: string
  tenantId: string
}

// ============================================================================
// 5. PAIRING — Pairing Hub↔Spoke (LAN)
// ============================================================================

export interface PairingCode {
  code: string
  nonce: string
  expiresAt: Date
  jwtToken: string
  hubIp: string
  hubPort: number
  pubKey: string
}

export interface PairingRequest {
  code: string
  nonce: string
  deviceId: string
  deviceName: string
  fingerprint: string
}

export interface PairingResponse {
  success: boolean
  jwt?: string
  error?: "expired" | "invalid_code" | "rate_limited" | "device_blacklisted" | "already_paired"
  retryAfter?: number
}

// ============================================================================
// 6. PRODUCT — Menú y productos
// ============================================================================

export interface Product {
  id: string
  tenantId: string
  name: string
  description: string
  price: number
  category: string
  isAvailable: boolean
  modifiers?: ProductModifier[]
  imageUrl?: string
  sortOrder?: number
}

export type ModifierGroupType = "single" | "multiple"

export interface ProductModifier {
  name: string
  type?: ModifierGroupType
  options: ModifierOption[]
  required?: boolean
  maxSelections?: number
}

export interface ModifierOption {
  name: string
  price: number
  subGroups?: ProductModifier[]
}

// ============================================================================
// 6b. PRODUCT CONFIGURATION — PCP resolved state
// ============================================================================

export interface ProductConfiguration {
  /** Group name → selected option name(s) */
  selections: Record<string, string | string[]>
  /** Free text observations */
  notes: string
  /** Quantity to add */
  quantity: number
}

export interface ConfiguredOrderItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  total: number
  modifiers?: OrderItemModifier[]
  notes?: string
}

// ============================================================================
// 7. MENU SNAPSHOT — Versión del menú offline
// ============================================================================

export interface MenuSnapshot {
  version: number
  tenantId: string
  products: Product[]
  categories: MenuCategory[]
  createdAt: Date
  signature: string
}

export interface MenuCategory {
  id: string
  name: string
  sortOrder: number
  isVisible: boolean
}

// ============================================================================
// 8. TABLE — Mesas
// ============================================================================

export interface Table {
  id: string
  tenantId: string
  number: number
  capacity: number
  status: TableStatus
  currentOrderId?: string
  serverId?: string
  section?: string
  needsBill?: boolean
}

export type TableStatus = "free" | "occupied" | "reserved" | "closed" | "needs_attention"

// ============================================================================
// 9. ORDER — Órdenes
// ============================================================================

export type OrderSource = "takeasygo" | "pos" | "external" | "delivery" | "takeaway"

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "en_ruta"
  | "arrived"
  | "delivered"
  | "cancelled"
  | "requires_manual_attention"

export interface Order {
  id: string
  tenantId: string
  source: OrderSource
  status: OrderStatus
  tableId?: string
  customerId?: string
  items: OrderItem[]
  total: number
  menuVersion: number
  notes?: string
  createdAt: Date
  updatedAt: Date
  syncedAt?: Date
  /** ID del pedido en el SaaS (external reference) */
  externalOrderId?: string
  /** Estado del pedido en el SyncLayer/SaaS */
  externalStatus?: 'awaiting_payment' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  /** Método de pago del pedido externo */
  paymentMethod?: PaymentMethod
  /** Origen del pago: pos_charged = cobrado en POS, external_prepaid = pagado online */
  paymentSource?: 'pos_charged' | 'external_prepaid'
  /** Timestamp de integración al POS */
  integratedAt?: Date
  /** Quién integró el pedido al POS */
  integratedBy?: string
}

export interface OrderItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  /** unitPrice * quantity — does NOT include modifiers. Total real = total + (modifiersPrice * quantity) */
  total: number
  modifiers?: OrderItemModifier[]
  notes?: string
}

export interface OrderItemModifier {
  name: string
  price: number
}

// ============================================================================
// 9a. SYNC ORDER — Pedido sincronizado desde el SaaS
// ============================================================================

export interface SyncOrder {
  tenantId: string
  externalOrderId: string
  source: 'takeasygo' | 'pos'
  status: 'pending' | 'confirmed' | 'preparing' | 'cancelled'
  paymentMethod?: string
  items: OrderItem[]
  total: number
  createdAt: Date
}

// ============================================================================
// 9b. KITCHEN COMMAND — Comandas de cocina
// ============================================================================

export interface KitchenCommand {
  id: string
  tenantId: string
  orderId: string
  tableNumber: number
  items: KitchenCommandItem[]
  status: "pending" | "preparing" | "ready"
  startedAt?: Date
  completedAt?: Date
  notes?: string
  delayed?: boolean
  time?: number
  createdAt: Date
  updatedAt: Date
}

export interface KitchenCommandItem {
  productId: string
  name: string
  quantity: number
  modifiers?: string[]
  notes?: string
  category: string
  station?: string
}

// ============================================================================
// 10. PAYMENT — Pagos
// ============================================================================

/**
 * Métodos de pago soportados por el POS.
 *
 * Decisión: Consenso v1 §1 — Unificación del enum.
 * - "posnet_debit" / "posnet_credit": POSNET con débito/crédito separados.
 * - "kripton": criptomoneda (integración en curso).
 * - "transfer": transferencia bancaria.
 * - Se eliminan valores ambiguos del enum anterior: "posnet", "debit", "credit", "pix", "usdt", "mixed".
 *
 * Referencia: CheckoutLayout.tsx usa 'mercadopago' | 'kripton' | 'transfer'.
 * El POS agrega efectivo y POSNET que son medios de pago presenciales.
 */
export type PaymentMethod = "cash" | "mercadopago" | "posnet_debit" | "posnet_credit" | "kripton" | "transfer"

/**
 * Canal por el cual llegó la venta.
 * Decisión: Consenso v1 §1 — Separar canal de método de pago.
 *
 * - "counter": venta presencial en mostrador/salón.
 * - "takeasygo": venta externa vía TakeasyGO (delivery, takeaway, dine-in app).
 *
 * Mapeo: orderMode del SaaS → CashChannel.
 *   'dine-in' | 'business' → 'counter'
 *   'takeaway' | 'delivery' → 'takeasygo'
 */
export type CashChannel = "counter" | "takeasygo"

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded"

export interface Payment {
  id: string
  orderId: string
  tenantId: string
  method: PaymentMethod
  amount: number
  status: PaymentStatus
  createdAt: Date
}

export interface CashPayment {
  amount: number
  changeDue: number
}

export interface PosnetPayment {
  lastFourDigits: string
  cardType: "debit" | "credit"
  authorizationCode?: string
  receiptNumber?: string
}

export interface MercadoPagoPayment {
  terminalId: string
  transactionId: string
  status: "approved" | "rejected" | "pending"
  qrCode?: string
}

// ============================================================================
// 11. CASH REGISTER — Caja
// ============================================================================

export type CashRegisterStatus = "open" | "closed"

export interface CashRegister {
  id: string
  tenantId: string
  openedBy: string
  closedBy?: string
  openedAt: Date
  closedAt?: Date
  initialAmount: number
  finalAmount?: number
  expectedAmount?: number
  difference?: number
  movements: CashMovement[]
  status: CashRegisterStatus
  /**
   * Canal default para routing de pedidos TakeasyGO.
   * Decisión: Consenso v1 §2.3 — Multi-caja routing.
   *
   * - null: esta caja acepta todos los canales (restaurante con una sola caja).
   * - 'counter': solo recibe ventas presenciales.
   * - 'takeasygo': solo recibe ventas de TakeasyGO.
   *
   * Si hay dos cajas abiertas, cada una tiene un defaultForChannel distinto.
   * Si un pedido no tiene caja target, va a pendingMovements.
   */
  defaultForChannel: CashChannel | null
  /**
   * Snapshot inmutable del cierre.
   * Decisión: Consenso v1 §3 — Z como snapshot inmutable.
   *
   * Se genera UNA VEZ al cerrar la caja. Nunca se recalcula.
   * PDF, impresión y vista web leen de este objeto.
   */
  zReport?: ZReport
  /**
   * Token de alta entropía para compartir el Z Report por link.
   * Decisión: Consenso v1 §4 — Vista web compartible.
   *
   * UUID v4 (128 bits de entropía). Válido por 30 días.
   * La URL es: {SYNC_URL}/api/v1/z-report/{shareToken}
   */
  shareToken?: string
}

export interface CashMovement {
  id: string
  type: CashMovementType
  amount: number
  reason: string
  userId: string
  timestamp: Date
  relatedOrderId?: string
  /**
   * Canal de la venta.
   * Decisión: Consenso v1 §1 — Separar canal de método de pago.
   */
  channel: CashChannel
  /**
   * Método de pago utilizado.
   * Decisión: Consenso v1 §1 — Dos campos independientes.
   *
   * Regla de negocio: expectedAmount (arqueo de efectivo) suma
   * SOLO movimientos con paymentMethod === 'cash', sin importar channel.
   */
  paymentMethod: PaymentMethod
}

export type CashMovementType =
  | "income"
  | "expense"
  | "withdrawal"
  | "deposit"
  | "sale"
  | "refund"

// ============================================================================
// 11b. Z REPORT — Snapshot inmutable de cierre
// ============================================================================
// Decisión: Consenso v1 §3 — El Z se genera UNA VEZ al cerrar y nunca se recalcula.
// Fuente: generateZReport() en apps/pos/src/services/z-report.ts

/**
 * Resumen de movimientos por canal.
 * Usado dentro de ZReport para el desglose counter vs takeasygo.
 */
export interface ZChannelSummary {
  sales: number
  income: number
  expenses: number
  refunds: number
  movementCount: number
}

/**
 * Reporte de cierre Z — snapshot inmutable.
 *
 * Se persiste en CashRegister.zReport al momento del cierre.
 * PDF, impresión térmica y vista web leen EXCLUSIVAMENTE de este objeto.
 * Nunca se recalcula después de generado.
 *
 * Estructura:
 * - Totales generales (inicial, esperado, final, diferencia)
 * - Desglose por canal (counter vs takeasygo)
 * - Desglose por método de pago (cash, mercadopago, posnet_debit, etc.)
 * - Resumen de movimientos (ingresos, egresos, ventas, reembolsos)
 * - Metadata (quién cerró, cuándo se generó)
 */
export interface ZReport {
  registerId: string
  tenantId: string
  closedAt: Date
  closedBy: string

  // ── Totales generales ────────────────────────────────────────────
  initialAmount: number
  finalAmount: number
  expectedAmount: number
  difference: number

  // ── Desglose por canal ───────────────────────────────────────────
  byChannel: {
    counter: ZChannelSummary
    takeasygo: ZChannelSummary
  }

  // ── Desglose por método de pago ──────────────────────────────────
  // Key: PaymentMethod, Value: total de montos de ese método
  byPaymentMethod: Record<PaymentMethod, number>

  // ── Movimientos ──────────────────────────────────────────────────
  totalMovements: number
  incomeTotal: number
  expenseTotal: number
  salesTotal: number
  refundTotal: number

  // ── Metadata ─────────────────────────────────────────────────────
  generatedAt: Date
}

// ============================================================================
// 12. FISCAL — AFIP / Facturación
// ============================================================================

export type FiscalDriver = "printer" | "wsfe"

export type ComprobanteType = "A" | "B" | "C" | "ticket"

export interface FiscalPrinterConfig {
  driver: "printer"
  connectionType: "serial" | "usb" | "tcp"
  port?: string
  ipAddress?: string
  model: string
  homologationNumber: string
}

export interface FiscalWSFEConfig {
  driver: "wsfe"
  certificate: string
  privateKey: string
  endpoint: string
  cuit: string
  puntoVenta: number
}

export type FiscalConfig = FiscalPrinterConfig | FiscalWSFEConfig

export interface FiscalDocument {
  id: string
  tenantId: string
  type: ComprobanteType
  puntoVenta: number
  numeroComprobante: number
  cae?: string
  fechaVencimientoCae?: Date
  total: number
  items: FiscalDocumentItem[]
  customerDocument?: string
  customerName?: string
  createdAt: Date
  qrData?: string
}

export interface FiscalDocumentItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
  ivaRate?: number
}

// ============================================================================
// 13. SYNC EVENT — Event sourcing offline
// ============================================================================

export type SyncEventType =
  | "order.created"
  | "order.updated"
  | "order.cancelled"
  | "order.delivered"
  | "order.confirmed"
  | "order.preparing"
  | "order.ready"
  | "order.en_ruta"
  | "order.arrived"
  | "table.status_changed"
  | "payment.completed"
  | "payment.refunded"
  | "cash_register.opened"
  | "cash_register.closed"
  | "cash_register.movement"
  | "menu.snapshot_updated"
  | "device.paired"
  | "device.blacklisted"

export type EventStatus = "pending" | "synced" | "conflict" | "failed" | "expired" | "requires_manual_attention"

export interface SyncEvent {
  id: string
  tenantId: string
  type: SyncEventType
  payload: unknown
  timestamp: Date
  nonce: string
  signature: string
}

export interface OfflineEvent {
  id: string
  tenantId: string
  type: SyncEventType
  payload: unknown
  timestamp: Date
  nonce: string
  signature: string
  status: EventStatus
  retryCount: number
  lastRetryAt?: Date
  conflictData?: unknown
}

// ============================================================================
// 14. AUDIT — Auditoría
// ============================================================================

export type AuditCategory =
  | "authentication"
  | "authorization"
  | "fiscal"
  | "payment"
  | "security"
  | "system"
  | "pairing"

export interface AuditEvent {
  id: string
  tenantId: string
  category: AuditCategory
  action: string
  userId: string
  deviceId?: string
  details?: Record<string, unknown>
  ip?: string
  timestamp: Date
}

// ============================================================================
// 15. COUNTER — Módulo Counter (ros.md)
// ============================================================================

export interface CounterState {
  customer?: CustomerProfile
  order: Order
  upsellSuggestions: Product[]
  crossSellSuggestions: Product[]
  appliedPromotions: AppliedPromotion[]
  paymentMethod?: PaymentMethod
}

export interface CustomerProfile {
  id: string
  name: string
  phone?: string
  email?: string
  totalOrders: number
  totalSpent: number
  averageTicket: number
  lastVisit?: Date
  loyaltyPoints?: number
  segment?: CustomerSegment
}

export type CustomerSegment = "new" | "returning" | "vip" | "at_risk" | "churned"

export interface AppliedPromotion {
  id: string
  code: string
  discountType: "percentage" | "fixed"
  discountValue: number
  appliedAmount: number
}

// ============================================================================
// 16. CAPACITOR / PWA — Tipos nativos
// ============================================================================

export interface PWAManifest {
  name: string
  short_name: string
  description: string
  start_url: string
  display: "standalone" | "fullscreen"
  background_color: string
  theme_color: string
  icons: PWAIcon[]
}

export interface PWAIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

// ============================================================================
// 17. CONFIG — Configuración del POS
// ============================================================================

export interface POSConfig {
  tenantId: string
  hubDeviceId: string
  syncLayerUrl: string
  socketUrl: string
  lanPort: number
  offlineTimeout: number
  fiscalConfig: FiscalConfig
  paymentMethods: PaymentMethod[]
  menuVersion: number
  lastSyncAt?: Date
}

// ============================================================================
// 18. WEBSOCKET — Eventos Socket.io
// ============================================================================

export type SocketEvent =
  | "order:created"
  | "order:updated"
  | "order:confirmed"
  | "order:status_updated"
  | "order:cancelled"
  | "order:preparing"
  | "order:ready"
  | "order:delivered"
  | "table:updated"
  | "payment:completed"
  | "sync:pending_events"
  | "sync:conflict"
  | "spoke:connected"
  | "spoke:disconnected"
  | "pairing:request"
  | "pairing:approved"
  | "pairing:rejected"
  | "heartbeat"

export interface SocketMessage {
  event: SocketEvent
  tenantId: string
  payload: unknown
  timestamp: Date
}
