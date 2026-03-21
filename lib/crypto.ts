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
 * No tiene IV aleatorio, por eso es apto para $group en MongoDB.
 */
export function hashPhone(phone: string): string {
  return crypto.createHash('sha256').update(phone.trim().toLowerCase()).digest('hex')
}