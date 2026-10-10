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
} from "./plans"
export { canPerformAction, PERMISSIONS } from "./authorization"
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
export { SAAS_TO_POS_ROLE, VALID_DEVICE_ROLES } from "./role-mapping"
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
