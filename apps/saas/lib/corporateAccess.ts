import { Types } from 'mongoose'

interface CorporateAccess {
  accessMode: string
  tenantIds: Types.ObjectId[] | string[]
}

interface TenantPaymentSetting {
  tenantId: Types.ObjectId | string
  paymentMode: string
  paymentTerms: string
}

interface CorporateWithSettings extends CorporateAccess {
  tenantSettings: TenantPaymentSetting[]
}

export function corporateHasAccess(
  account: CorporateAccess,
  tenantId: string | Types.ObjectId
): boolean {
  const tid = tenantId.toString()
  if (account.accessMode === 'all') return true
  return account.tenantIds.some(id => id.toString() === tid)
}

export function getTenantPaymentConfig(
  account: CorporateWithSettings,
  tenantId: string | Types.ObjectId
): TenantPaymentSetting | undefined {
  const tid = tenantId.toString()
  return account.tenantSettings.find(s => s.tenantId.toString() === tid)
}
