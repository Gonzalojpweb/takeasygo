import mongoose, { Schema, Document } from 'mongoose'
import { isIvaRate, type IssuerIvaCondition } from '@takeasygo/business'

// ============================================================================
// FiscalProfile — datos fiscales y conexión con ARCA, UNO por comercio
// ============================================================================
// Fases 3–5 de caja (2026-10). Docs: ADMIN/FASE3_DATOS_FISCALES_E_IVA.md,
// ADMIN/FASE4_ARCA_FACTURA_ELECTRONICA.md.
//
// Colección propia (no dentro de Tenant) a propósito:
//   · el certificado y la clave privada del comercio nunca viajan en las
//     lecturas habituales de Tenant (que se hacen en cada request);
//   · el punto de venta es POR SEDE (cada sede factura con el suyo);
//   · el ticket de acceso de ARCA (WSAA, ~12 h) se cachea acá.
//
// Secretos (certificate, privateKey, wsaa.token, wsaa.sign): cifrados con
// AES-256-GCM (lib/crypto) y `select: false`. Solo los lee el servidor que
// emite (lib/fiscal/*). Nunca se devuelven al navegador ni al POS.
// ============================================================================

export type FiscalEnvironment = 'homologation' | 'production'
/** Cómo factura el POS al cobrar: preguntar, siempre, o no facturar. */
export type InvoicingMode = 'ask' | 'always' | 'off'

export interface IPointOfSale {
  locationId: mongoose.Types.ObjectId
  /** Número de punto de venta "Web Service" dado de alta en ARCA (1–99998). */
  number: number
}

export interface IFiscalProfile extends Document {
  tenantId: mongoose.Types.ObjectId
  /** Facturación activa (requiere datos + certificado + punto de venta). */
  enabled: boolean
  cuit: string
  legalName: string
  ivaCondition: IssuerIvaCondition | null
  grossIncomeNumber: string
  activityStartDate: Date | null
  fiscalAddress: string
  /** Alícuota por defecto de la carta (%). */
  defaultIvaRate: number
  environment: FiscalEnvironment
  invoicingMode: InvoicingMode
  pointsOfSale: IPointOfSale[]
  credentials: {
    /** PEM del certificado emitido por ARCA (cifrado). */
    certificate: string
    /** PEM de la clave privada (cifrado). Se genera acá junto con el CSR. */
    privateKey: string
    /**
     * Clave del último CSR generado, todavía sin certificado (cifrada). Al
     * renovar, la clave vigente sigue facturando hasta que se cargue el
     * certificado nuevo; recién ahí se reemplaza.
     */
    pendingPrivateKey: string
    /** Pedido de certificado (CSR, público) para subir a ARCA. */
    csr: string
    csrCreatedAt: Date | null
    certificateSubject: string
    certificateExpiresAt: Date | null
  }
  /** Última prueba de conexión con ARCA (Fase 4). */
  connection: {
    checkedAt: Date | null
    ok: boolean
    environment: FiscalEnvironment | null
    message: string
  }
  /** Ticket de acceso WSAA (token/sign cifrados), por ambiente. */
  wsaa: {
    environment: FiscalEnvironment | null
    token: string
    sign: string
    expiresAt: Date | null
    /** Candado para que dos facturas en paralelo no pidan dos tickets. */
    lockedUntil: Date | null
  }
  createdAt: Date
  updatedAt: Date
}

const PointOfSaleSchema = new Schema<IPointOfSale>(
  {
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    number: { type: Number, required: true, min: 1, max: 99998 },
  },
  { _id: false }
)

const FiscalProfileSchema = new Schema<IFiscalProfile>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    enabled: { type: Boolean, default: false },
    cuit: { type: String, default: '', trim: true, maxlength: 11 },
    legalName: { type: String, default: '', trim: true, maxlength: 120 },
    ivaCondition: {
      type: String,
      enum: ['responsable_inscripto', 'monotributo', 'exento', null],
      default: null,
    },
    grossIncomeNumber: { type: String, default: '', trim: true, maxlength: 40 },
    activityStartDate: { type: Date, default: null },
    fiscalAddress: { type: String, default: '', trim: true, maxlength: 200 },
    defaultIvaRate: {
      type: Number,
      default: 21,
      validate: { validator: (v: number) => isIvaRate(v), message: 'Alícuota de IVA inválida' },
    },
    environment: { type: String, enum: ['homologation', 'production'], default: 'homologation' },
    invoicingMode: { type: String, enum: ['ask', 'always', 'off'], default: 'ask' },
    pointsOfSale: { type: [PointOfSaleSchema], default: [] },
    credentials: {
      certificate: { type: String, default: '', select: false },
      privateKey: { type: String, default: '', select: false },
      pendingPrivateKey: { type: String, default: '', select: false },
      csr: { type: String, default: '' },
      csrCreatedAt: { type: Date, default: null },
      certificateSubject: { type: String, default: '' },
      certificateExpiresAt: { type: Date, default: null },
    },
    connection: {
      checkedAt: { type: Date, default: null },
      ok: { type: Boolean, default: false },
      environment: { type: String, enum: ['homologation', 'production', null], default: null },
      message: { type: String, default: '', maxlength: 500 },
    },
    wsaa: {
      environment: { type: String, enum: ['homologation', 'production', null], default: null },
      token: { type: String, default: '', select: false },
      sign: { type: String, default: '', select: false },
      expiresAt: { type: Date, default: null },
      lockedUntil: { type: Date, default: null },
    },
  },
  { timestamps: true }
)

FiscalProfileSchema.index({ tenantId: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  Reflect.deleteProperty(mongoose.models, 'FiscalProfile')
}

const FiscalProfile =
  (mongoose.models.FiscalProfile as mongoose.Model<IFiscalProfile>) ||
  mongoose.model<IFiscalProfile>('FiscalProfile', FiscalProfileSchema)

export default FiscalProfile
