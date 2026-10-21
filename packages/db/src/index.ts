export { connectMongo, disconnectMongo } from "./connection"
export { MenuModel, type IMenuDocument } from "./models/menu"
export { LocationModel, type ILocationDocument } from "./models/location"
export { SyncOrderModel, type SyncOrderDocument } from "./models/sync-order"
export { CashSaleEventModel, type CashSaleEventDocument } from "./models/cash-sale-event"
export { ZReportRecordModel, type ZReportRecordDocument } from "./models/z-report-record"
export { UserModel } from "./models/user"
export { ConsumerModel } from "./models/consumer"
export { TenantModel } from "./models/tenant"

// Inventory: los modelos viven SOLO en apps/saas/models (DECISIONES_VIGENTES D-15).

// ── Compliance Engine ────────────────────────────────────────────────────────
export { ComplianceConfigModel, DEFAULT_SLA_RULES, type IComplianceConfigDocument, type ISlaRule } from "./models/compliance-config"
export { ComplianceAlertModel, type IComplianceAlertDocument } from "./models/compliance-alert"

// ── Nudges Engine ───────────────────────────────────────────────────────────
export { NudgeRuleModel, DEFAULT_NUDGE_RULES, type INudgeRuleDocument, type INudgeCondition, type INudgeContent, type NudgeChannel, type NudgeFrequency } from "./models/nudge-rule"
