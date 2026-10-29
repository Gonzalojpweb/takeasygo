import mongoose, { Schema, type Model } from 'mongoose'

// ============================================================================
// Bitácora de TEO (asistente de soporte) — un documento por intercambio
// ============================================================================
// Harness §«Límites, costo y bitácora». Sirve para: detectar dónde falla la
// documentación (pulgares abajo), medir el costo real por conversación y
// auditar reclamos. Retención: 90 días (índice TTL sobre createdAt) — las
// preguntas pueden traer datos personales que el usuario escribió.
// Multi-tenant: toda lectura filtra por tenantId primero.
// ============================================================================

export type AssistantFilter = 'entrada' | 'salida' | 'limite' | 'insistencia' | 'rechazo_modelo' | 'error' | null

export const ASSISTANT_LOG_RETENTION_DAYS = 90

export interface IAssistantLog {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  userId: string
  conversationId: string
  /** Rol del harness (admin/manager/cashier/waiter/kitchen) y rol real del usuario. */
  role: string
  userRole: string
  plan: string
  activeModules: string[]
  locationId: string | null
  question: string
  reply: string
  /** Documentos de la KB que recibió el modelo. */
  docs: string[]
  /** Qué control actuó (null = respuesta normal del modelo). */
  filter: AssistantFilter
  model: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
  latencyMs: number
  rating: 1 | -1 | null
  escalated: boolean
  escalatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const AssistantLogSchema = new Schema<IAssistantLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: String, required: true },
    conversationId: { type: String, required: true },
    role: { type: String, required: true },
    userRole: { type: String, required: true },
    plan: { type: String, required: true },
    activeModules: { type: [String], default: [] },
    locationId: { type: String, default: null },
    question: { type: String, required: true, maxlength: 1000 },
    reply: { type: String, required: true, maxlength: 8000 },
    docs: { type: [String], default: [] },
    filter: {
      type: String,
      enum: ['entrada', 'salida', 'limite', 'insistencia', 'rechazo_modelo', 'error', null],
      default: null,
    },
    model: { type: String, default: null },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    rating: { type: Number, enum: [1, -1, null], default: null },
    escalated: { type: Boolean, default: false },
    escalatedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Historial de una conversación y cuota diaria por usuario.
AssistantLogSchema.index({ tenantId: 1, userId: 1, conversationId: 1, createdAt: -1 })
AssistantLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 })
// Superadmin: derivaciones pendientes y gasto del mes.
AssistantLogSchema.index({ escalated: 1, createdAt: -1 })
AssistantLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ASSISTANT_LOG_RETENTION_DAYS * 24 * 60 * 60 })

const AssistantLog: Model<IAssistantLog> =
  (mongoose.models.AssistantLog as Model<IAssistantLog>) ||
  mongoose.model<IAssistantLog>('AssistantLog', AssistantLogSchema)

export default AssistantLog
