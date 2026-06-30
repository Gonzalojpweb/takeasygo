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

export interface ProductModifier {
  name: string
  options: ModifierOption[]
  required?: boolean
  maxSelections?: number
}

export interface ModifierOption {
  name: string
  price: number
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
}

export type TableStatus = "free" | "occupied" | "reserved" | "closed"

// ============================================================================
// 9. ORDER — Órdenes
// ============================================================================

export type OrderSource = "takeasygo" | "pos"

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
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
}

export interface OrderItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  total: number
  modifiers?: OrderItemModifier[]
  notes?: string
}

export interface OrderItemModifier {
  name: string
  price: number
}

// ============================================================================
// 10. PAYMENT — Pagos
// ============================================================================

export type PaymentMethod = "cash" | "posnet" | "mercadopago"

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
}

export interface CashMovement {
  id: string
  type: CashMovementType
  amount: number
  reason: string
  userId: string
  timestamp: Date
  relatedOrderId?: string
}

export type CashMovementType =
  | "income"
  | "expense"
  | "withdrawal"
  | "deposit"
  | "sale"
  | "refund"

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
  | "table.status_changed"
  | "payment.completed"
  | "payment.refunded"
  | "cash_register.opened"
  | "cash_register.closed"
  | "cash_register.movement"
  | "menu.snapshot_updated"
  | "device.paired"
  | "device.blacklisted"

export type EventStatus = "pending" | "synced" | "conflict" | "failed" | "expired"

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
  | "order:cancelled"
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
