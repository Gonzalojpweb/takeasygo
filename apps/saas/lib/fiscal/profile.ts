import mongoose from 'mongoose'
import FiscalProfile, { type IFiscalProfile } from '@/models/FiscalProfile'
import { isValidCuit, isValidPointOfSale } from '@takeasygo/business'

// ============================================================================
// Perfil fiscal — lectura segura y "¿está listo para facturar?"
// ============================================================================
// Fase 3 de caja (2026-10). Docs: ADMIN/FASE3_DATOS_FISCALES_E_IVA.md.
// Lo que sale de acá NUNCA incluye el certificado, la clave ni el ticket de
// ARCA: solo si existen y cuándo vencen.
// ============================================================================

export interface PublicFiscalProfile {
  enabled: boolean
  cuit: string
  legalName: string
  ivaCondition: IFiscalProfile['ivaCondition']
  grossIncomeNumber: string
  activityStartDate: string | null
  fiscalAddress: string
  defaultIvaRate: number
  environment: IFiscalProfile['environment']
  invoicingMode: IFiscalProfile['invoicingMode']
  onlineInvoicing: IFiscalProfile['onlineInvoicing']
  pointsOfSale: { locationId: string; number: number }[]
  contingency: { enabled: boolean; pointsOfSale: { locationId: string; number: number }[] }
  connection: { checkedAt: string | null; ok: boolean; environment: IFiscalProfile['environment'] | null; message: string }
  credentials: {
    hasCsr: boolean
    csr: string
    csrCreatedAt: string | null
    hasCertificate: boolean
    certificateSubject: string
    certificateExpiresAt: string | null
  }
}

export type ReadinessStep = 'data' | 'pointOfSale' | 'certificate' | 'connection'

export interface FiscalReadiness {
  ready: boolean
  steps: { step: ReadinessStep; ok: boolean; detail: string }[]
}

type LeanProfile = Omit<IFiscalProfile, keyof mongoose.Document> & { _id?: unknown }

export async function loadFiscalProfile(tenantId: string | mongoose.Types.ObjectId): Promise<LeanProfile | null> {
  return (await FiscalProfile.findOne({ tenantId }).lean()) as LeanProfile | null
}

/** Con `+credentials.certificate +credentials.privateKey`: solo para emitir. */
export async function loadFiscalProfileWithSecrets(tenantId: string | mongoose.Types.ObjectId) {
  return FiscalProfile.findOne({ tenantId })
    .select('+credentials.certificate +credentials.privateKey +credentials.pendingPrivateKey')
    .lean<LeanProfile>()
}

export function toPublicProfile(p: LeanProfile | null, hasCertificate = false): PublicFiscalProfile {
  return {
    enabled: p?.enabled ?? false,
    cuit: p?.cuit ?? '',
    legalName: p?.legalName ?? '',
    ivaCondition: p?.ivaCondition ?? null,
    grossIncomeNumber: p?.grossIncomeNumber ?? '',
    activityStartDate: p?.activityStartDate ? new Date(p.activityStartDate).toISOString().slice(0, 10) : null,
    fiscalAddress: p?.fiscalAddress ?? '',
    defaultIvaRate: p?.defaultIvaRate ?? 21,
    environment: p?.environment ?? 'homologation',
    invoicingMode: p?.invoicingMode ?? 'ask',
    onlineInvoicing: p?.onlineInvoicing ?? 'off',
    pointsOfSale: (p?.pointsOfSale ?? []).map((x) => ({ locationId: String(x.locationId), number: x.number })),
    contingency: {
      enabled: p?.contingency?.enabled ?? false,
      pointsOfSale: (p?.contingency?.pointsOfSale ?? []).map((x) => ({ locationId: String(x.locationId), number: x.number })),
    },
    connection: {
      checkedAt: p?.connection?.checkedAt ? new Date(p.connection.checkedAt).toISOString() : null,
      ok: p?.connection?.ok ?? false,
      environment: p?.connection?.environment ?? null,
      message: p?.connection?.message ?? '',
    },
    credentials: {
      hasCsr: Boolean(p?.credentials?.csr),
      csr: p?.credentials?.csr ?? '',
      csrCreatedAt: p?.credentials?.csrCreatedAt ? new Date(p.credentials.csrCreatedAt).toISOString() : null,
      hasCertificate,
      certificateSubject: p?.credentials?.certificateSubject ?? '',
      certificateExpiresAt: p?.credentials?.certificateExpiresAt
        ? new Date(p.credentials.certificateExpiresAt).toISOString()
        : null,
    },
  }
}

/** ¿Hay certificado cargado? (sin leer su contenido fuera del server). */
export async function hasCertificate(tenantId: string | mongoose.Types.ObjectId): Promise<boolean> {
  const doc = await FiscalProfile.findOne({ tenantId })
    .select('+credentials.certificate')
    .lean<{ credentials?: { certificate?: string } }>()
  return Boolean(doc?.credentials?.certificate)
}

/**
 * Pasos para poder facturar. La conexión cuenta solo si la última prueba
 * contra ARCA salió bien EN EL AMBIENTE ACTUAL (homologación ≠ producción).
 */
export function fiscalReadiness(p: PublicFiscalProfile, activeLocationIds: readonly string[]): FiscalReadiness {
  const connectionOk = p.connection.ok && p.connection.environment === p.environment
  const dataOk =
    isValidCuit(p.cuit) && p.legalName.trim().length > 1 && p.ivaCondition !== null && p.fiscalAddress.trim().length > 3
  const posFor = new Set(p.pointsOfSale.filter((x) => isValidPointOfSale(x.number)).map((x) => x.locationId))
  const missing = activeLocationIds.filter((id) => !posFor.has(id)).length
  const certOk =
    p.credentials.hasCertificate &&
    (!p.credentials.certificateExpiresAt || new Date(p.credentials.certificateExpiresAt) > new Date())

  const steps: FiscalReadiness['steps'] = [
    { step: 'data', ok: dataOk, detail: dataOk ? 'Datos fiscales completos' : 'Completá CUIT, razón social, condición y domicilio' },
    {
      step: 'pointOfSale',
      ok: activeLocationIds.length > 0 && missing === 0,
      detail: missing === 0 ? 'Cada sede tiene su punto de venta' : `${missing} sede(s) sin punto de venta`,
    },
    {
      step: 'certificate',
      ok: certOk,
      detail: certOk ? 'Certificado cargado' : p.credentials.hasCertificate ? 'El certificado venció' : 'Falta el certificado de ARCA',
    },
    { step: 'connection', ok: connectionOk, detail: connectionOk ? 'Conexión con ARCA probada' : 'Falta probar la conexión con ARCA' },
  ]
  return { ready: steps.every((s) => s.ok), steps }
}
