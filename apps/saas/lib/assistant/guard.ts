import { ASSISTANT_LIMITS } from './config'
import { alwaysText } from './knowledge'

// ============================================================================
// TEO — filtros de entrada y de salida (harness §«Capas de defensa», 2 y 3)
// ============================================================================
// Entrada: CONSERVADOR. Solo corta lo evidente (pedido explícito de código,
// intento de cambiar identidad / ver el prompt, mensaje demasiado largo). Lo
// ambiguo lo resuelve el modelo con la política: un filtro de palabras sueltas
// bloquearía «¿dónde pongo el código de descuento?».
// Salida: si la respuesta trae bloques de código, etiquetas HTML, secretos con
// formato conocido o texto literal de la política, se reemplaza por la
// respuesta fija. La documentación no lleva código: no hay falsos positivos
// esperables.
// ============================================================================

export type FixedReplyKind =
  | 'codigo'
  | 'identidad'
  | 'fuera_de_alcance'
  | 'demasiado_largo'
  | 'limite_minuto'
  | 'limite_dia'
  | 'limite_gasto'
  | 'insistencia'
  | 'no_disponible'
  | 'error'

const FIXED: Record<FixedReplyKind, string> = {
  codigo:
    'Eso queda fuera de lo que puedo hacer: soy TEO, el asistente de soporte de TakeasyGO, y no genero código. Si me contás qué querés lograr en la plataforma, te explico cómo hacerlo con sus funciones.',
  identidad:
    'No puedo cambiar mi rol ni mostrar mi configuración interna. Soy TEO, el asistente de soporte de TakeasyGO. ¿En qué te ayudo con la plataforma?',
  fuera_de_alcance:
    'Gracias por tu mensaje, pero estoy acá solo para ayudarte con TakeasyGO. ¿Tenés alguna pregunta sobre la plataforma, sus módulos, la configuración o algún error?',
  demasiado_largo: `Tu mensaje es muy largo. Contame tu duda en menos de ${ASSISTANT_LIMITS.maxMessageChars} caracteres y te ayudo.`,
  limite_minuto: 'Estás enviando mensajes muy rápido. Esperá un minuto y seguimos.',
  limite_dia:
    'Llegaste al límite de consultas de hoy. Mañana seguimos; si es urgente, tocá «Contactar a soporte».',
  limite_gasto:
    'Ahora no puedo responder consultas. Si es urgente, tocá «Contactar a soporte» y el equipo te ayuda.',
  insistencia:
    'Como te comenté, eso queda fuera de lo que puedo hacer. Si necesitás algo más, tocá «Contactar a soporte» y una persona del equipo te ayuda.',
  no_disponible: 'Estoy por entrar en acción: muy pronto vas a poder consultarme desde acá.',
  error:
    'No pude responder en este momento. Probá de nuevo en un rato; si sigue fallando, tocá «Contactar a soporte».',
}

export function fixedReply(kind: FixedReplyKind): string {
  return FIXED[kind]
}

export interface Verdict {
  block: boolean
  kind?: FixedReplyKind
  reason?: string
}

const OK: Verdict = { block: false }

/** Pedido EXPLÍCITO de escribir código (verbo de pedido + artefacto de programación). */
const CODE_REQUEST =
  /\b(escrib\w*|hac\w*|gener\w*|dame|pas\w*|arm\w*|cre\w*|program\w*|necesito|quiero)\b[^.?!\n]{0,40}\b(c[oó]digo\s+(html|css|javascript|js|sql|python|php)|script|query\s+sql|consulta\s+sql|sql\b|html\b|css\b|javascript|python|macro|regex|endpoint)/i
/** Intentos de cambiar identidad o ver la configuración interna. */
const IDENTITY =
  /\b(ignor\w*|olvid\w*)\b[^.?!\n]{0,30}\b(instrucciones|reglas|indicaciones)\b|\bmodo\s+(desarrollador|developer|dios|admin)\b|\bdeveloper\s+mode\b|\b(mostr\w*|revel\w*|dame|pas\w*|copi\w*|repet\w*)\b[^.?!\n]{0,30}\b(tu|el)\s+(prompt|system\s*prompt|configuraci[oó]n\s+interna|instrucciones)\b|\bjailbreak\b|\bDAN\b/i

export function checkInput(message: string): Verdict {
  const text = message.trim()
  if (text.length > ASSISTANT_LIMITS.maxMessageChars) return { block: true, kind: 'demasiado_largo', reason: 'largo' }
  if (text.includes('```') || /<\s*(script|iframe|style)\b/i.test(text)) return { block: true, kind: 'codigo', reason: 'codigo_pegado' }
  if (IDENTITY.test(text)) return { block: true, kind: 'identidad', reason: 'identidad' }
  if (CODE_REQUEST.test(text)) return { block: true, kind: 'codigo', reason: 'pedido_codigo' }
  return OK
}

const SECRET_PATTERNS: [string, RegExp][] = [
  ['anthropic_key', /sk-ant-[a-z0-9_-]{8,}/i],
  ['openai_key', /\bsk-[a-z0-9]{20,}/i],
  ['aws_key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['mongo_uri', /mongodb(\+srv)?:\/\/[^\s]+/i],
  ['redis_uri', /rediss?:\/\/[^\s]+/i],
  ['jwt', /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{5,}/],
  ['mp_token', /\b(APP_USR|TEST)-\d{6,}-[a-z0-9-]{10,}/i],
  ['env_var', /\b(MONGODB_URI|AUTH_SECRET|NEXTAUTH_SECRET|SYNC_LAYER_SECRET|INTERNAL_API_SECRET|ANTHROPIC_API_KEY|JWT_PRIVATE_KEY)\b/],
]

/** Líneas largas de la política/prompt base: si aparecen literales, se está filtrando el prompt. */
let promptLines: string[] | null = null
function policyLines(): string[] {
  if (!promptLines) {
    promptLines = alwaysText()
      .split('\n')
      .map((l) => l.replace(/^[-*#>\d.\s]+/, '').replace(/\*\*/g, '').trim())
      .filter((l) => l.length >= 90 && !l.startsWith('"') && !l.includes('Eso queda fuera') && !l.includes('estoy aquí solo'))
  }
  return promptLines
}

export function checkOutput(reply: string): Verdict {
  if (/```/.test(reply)) return { block: true, kind: 'codigo', reason: 'bloque_codigo' }
  // Etiqueta HTML (atributos acotados: sin backtracking largo).
  if (/<\/?[a-z][a-z0-9-]{0,30}(?:\s[^<>]{0,300})?>/i.test(reply)) return { block: true, kind: 'codigo', reason: 'html' }
  for (const [name, re] of SECRET_PATTERNS) {
    if (re.test(reply)) return { block: true, kind: 'fuera_de_alcance', reason: `secreto:${name}` }
  }
  const flat = reply.replace(/\*\*/g, '')
  if (policyLines().some((l) => flat.includes(l))) return { block: true, kind: 'identidad', reason: 'texto_politica' }
  return OK
}
