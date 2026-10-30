export { calculateOrderTotal, calculateItemTotal, validateOrderItems, calculateHalfHalfPrice, resolveHalfPriceCustomizations } from "./order"
export {
  type Plan,
  type Feature,
  canAccess,
  requiredPlanFor,
  PLAN_ACCESS,
  PLAN_LABELS,
  PLAN_TAGLINES,
  PLAN_COLORS,
  PLAN_PRICE,
  LOYALTY_MEMBER_LIMIT,
  PLAN_FEATURES_LANDING,
  HIDDEN_REWARDS_GROWTH_LIMIT,
  HIDDEN_REWARDS_LIMIT,
  PRINTER_LIMIT,
} from "./plans"
export { canPerformAction, PERMISSIONS } from "./authorization"
export { SHARED_SURFACES, SHARED_SURFACE_ROLES, canSeeSharedSurfaces, POS_ONLY_ADMIN_PATHS, isPosOnlyAdminPath, type SharedSurface, type SharedSurfaceId, type SharedSurfaceRole } from "./surfaces"
export {
  PRINTER_DOCUMENTS,
  PRINTER_DOCUMENT_LABELS,
  FISCAL_DOCUMENTS,
  SAAS_PRINTER_DOCUMENTS,
  PAPER_COLUMNS,
  isPrinterDocument,
  effectiveDocuments,
  allowedPrinterDocuments,
  validatePrinterDocuments,
  styleRoleFor,
  rolesForDocuments,
  type PrinterDocument,
} from "./printing"
export {
  MAX_CASH_SHIFTS,
  hhmmToMinutes,
  shiftCovers,
  validateShifts,
  shiftForMinutes,
  shiftDateFor,
  shiftLabel,
  type CashShift,
} from "./shifts"
export {
  DELIVERY_PLATFORM_LIST,
  MAX_DELIVERY_COMMISSION_PERCENT,
  isDeliveryPlatformId,
  deliveryPlatformName,
  validateDeliveryPlatforms,
  deliveryCommissionCents,
  type DeliveryPlatformId,
  type DeliverySettlement,
  type DeliveryPlatformConfig,
} from "./delivery-platforms"
// sync-events and jwt removed from barrel — they use node:crypto and must NOT
// be bundled for client. Import directly:
//   import { ... } from '@takeasygo/business/sync-events'
//   import { ... } from '@takeasygo/business/jwt'
export {
  generateSalt,
  deriveKey,
  deriveSessionEncryptionKey,
  PBKDF2_ITERATIONS,
  encrypt,
  decrypt,
  encryptStore,
  decryptStore,
} from "./crypto"
export { SAAS_TO_POS_ROLE, VALID_DEVICE_ROLES, deviceTypeForPosRole } from "./role-mapping"
export { normalizeForSearch } from "./utils"
export { escapeRegex } from "./security/escape-regex"
export { toCents, toPesos, formatCents } from "./money"
export {
  TABLE_TRANSITIONS,
  ORDER_TRANSITIONS,
  ORDER_ITEM_EDITABLE_STATUSES,
  isValidTableTransition,
  isValidOrderTransition,
  allowedTableTransitions,
  allowedOrderTransitions,
  canEditOrderItems,
  assertTableTransition,
  assertOrderTransition,
} from "./transitions"
export {
  POSITIVE_CASH_TYPES,
  NEGATIVE_CASH_TYPES,
  cashExpectedDelta,
  affectsCashExpected,
  isPositiveCashType,
  findMovementForOrder,
  hasMovementForOrder,
  findRegisterForChannel,
  openRegistersOf,
} from "./cash"
export {
  CASH_EXPENSE_CATEGORIES,
  CASH_EXPENSE_CATEGORY_LABELS,
  isCashExpenseCategory,
  movementRequiresCategory,
  movementRequiresApproval,
  ARS_BILL_DENOMINATIONS,
  MAX_DENOMINATION_COUNT,
  sumDenominations,
  canSeeExpectedCash,
  isApproverRole,
  VOID_REASONS,
  VOID_REASON_LABELS,
  isVoidReason,
  type VoidReason,
} from "./cash-control"
export {
  RECEIVER_IVA_CONDITION_IDS,
  ISSUER_IVA_CONDITION_LABELS,
  RECEIVER_IVA_CONDITION_LABELS,
  IVA_RATES,
  DEFAULT_IVA_RATE,
  isIvaRate,
  ivaRateAfipId,
  resolveIvaRate,
  cbteTipo,
  invoiceLetterFor,
  receiverNeedsCuit,
  computeIvaBreakdown,
  isValidCuit,
  normalizeCuit,
  formatCuit,
  isValidPointOfSale,
  type IssuerIvaCondition,
  type ReceiverIvaCondition,
  type IvaRatePct,
  type InvoiceLetter,
  type FiscalDocKind,
  type FiscalLine,
  type IvaGroup,
  type IvaBreakdown,
} from "./fiscal"
export { generateZReport, type ZReportInput } from "./z-report"
export {
  flattenMenu,
  flattenMenuSnapshot,
  injectHalfPriceModifiers,
  type FlatMenuResult,
  type RawMenu,
  type RawMenuCategory,
  type RawMenuItem,
  type RawCustomizationGroup,
} from "./menu-flatten"
export { resolveMongoDbName, assertMongoDbName, isProdDefaultDbName, PROD_DEFAULT_DB_NAME } from "./mongo"
export {
  type RewardRedemptionMode,
  type RewardRejectionReason,
  type RewardRedemptionInput,
  type RewardRedemptionDecision,
  PENDING_ADVANCE_ERROR,
  MICRO_ADVANCE_RATIO,
  computeMicroAdvance,
  isPendingAdvanceBlocking,
  evaluateRewardRedemption,
} from "./rewards"
export {
  type CheckoutPart,
  type AllocatedPayment,
  splitEvenly,
  remainingToPay,
  isCheckoutComplete,
  cashChange,
  allocatePayments,
  pathToDelivered,
} from "./checkout"
