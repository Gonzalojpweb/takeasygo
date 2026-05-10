import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('ENCRYPTION_KEY no está configurada')
  return Buffer.from(secret, 'base64')
}

export function encrypt(text: string): string {
  const KEY = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encryptedText: string): string {
  const KEY = getKey()
  const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

/**
 * Intenta desencriptar. Si falla (p.ej. texto en claro de órdenes antiguas), devuelve el valor original.
 * Permite migración gradual sin romper órdenes existentes.
 */
export function safeDecrypt(value: string): string {
  try {
    return decrypt(value)
  } catch {
    return value
  }
}

/**
 * SHA-256 estable del teléfono — permite agrupar por cliente sin exponer el número.
 * NORMALIZACIÓN ROBUSTA: Solo mantiene los últimos 10 dígitos numéricos para evitar 
 * fallos por prefijos (+54, 9, 0, etc.) que varían según el origen del dato.
 * Esto es crítico para Argentina y otros países con prefijos móviles variables.
 */
export function hashPhone(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.length >= 10 ? digits.slice(-10) : digits
  return crypto.createHash('sha256').update(normalized).digest('hex')
}