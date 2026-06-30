// ============================================================================
// Crypto — WebCrypto AES-GCM encryption + PBKDF2 key derivation
// Según SECURITYPOS.md sección 7.2:
//   - IndexedDB cifrado con AES-256-GCM
//   - Clave derivada de credenciales del usuario (PBKDF2 + salt)
//   - Salt único por tenant
// ============================================================================

export const PBKDF2_ITERATIONS = 600000 // OWASP recommendation for PBKDF2-SHA256
const SALT_LENGTH = 16
const IV_LENGTH = 12 // 96 bits recommended for AES-GCM
const KEY_LENGTH = 256

/**
 * Genera un salt aleatorio para PBKDF2.
 * Guardar por tenant, NO regenerar.
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
}

/**
 * Deriva una clave AES-256-GCM a partir de una contraseña y salt usando PBKDF2.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password).buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  )
}

/**
 * Cifra datos con AES-256-GCM.
 * @param data - Datos a cifrar (string o Uint8Array)
 * @param key - Clave CryptoKey (deriveKey)
 * @returns Objeto con IV + datos cifrados (ambos como base64)
 */
export async function encrypt(
  data: string | Uint8Array,
  key: CryptoKey
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoder = new TextEncoder()
  const dataBuffer =
    typeof data === "string"
      ? encoder.encode(data).buffer as ArrayBuffer
      : data.buffer as ArrayBuffer

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    dataBuffer
  )

  return {
    iv: uint8ArrayToBase64(iv),
    ciphertext: uint8ArrayToBase64(new Uint8Array(encrypted)),
  }
}

/**
 * Descifra datos cifrados con AES-256-GCM.
 * @param iv - IV en base64
 * @param ciphertext - Datos cifrados en base64
 * @param key - Clave CryptoKey (deriveKey)
 * @returns Datos descifrados como string
 */
export async function decrypt(
  iv: string,
  ciphertext: string,
  key: CryptoKey
): Promise<string> {
  const ivBuffer = base64ToUint8Array(iv)
  const ciphertextBuffer = base64ToUint8Array(ciphertext)

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer as unknown as ArrayBuffer },
    key,
    ciphertextBuffer as unknown as ArrayBuffer
  )

  return new TextDecoder().decode(decrypted)
}

// ============================================================================
// IndexedDB Encryption Store — Para cifrar/decifrar objetos completos
// ============================================================================

/**
 * Deriva una clave de cifrado para IndexedDB a partir del PIN de sesión del cajero.
 *
 * Según SECURITYPOS.md §7.2 + decisión sellada por Sirius:
 *   - El PIN/password del login se descarta de memoria INMEDIATAMENTE tras derivar
 *   - La clave derivada vive SOLO en memoria (nunca en IndexedDB)
 *   - Al cerrar sesión, la referencia se pierde y la clave se descarta
 *   - Los eventos cifrados quedan ilegibles hasta el próximo login del mismo cajero
 *     → comportamiento esperado, no es bug
 *
 * @param sessionPin - PIN de sesión del cajero (se descarta tras la llamada)
 * @param tenantSalt - Salt único por tenant (generado con generateSalt, almacenado en tenant config)
 * @returns CryptoKey AES-256-GCM para usar en encryptStore/decryptStore
 */
export async function deriveSessionEncryptionKey(
  sessionPin: string,
  tenantSalt: Uint8Array
): Promise<CryptoKey> {
  return deriveKey(sessionPin, tenantSalt)
}

/**
 * Cifra un objeto JSON completo para almacenar en IndexedDB.
 */
export async function encryptStore<T>(
  data: T,
  key: CryptoKey
): Promise<{ iv: string; ciphertext: string; version: number }> {
  const jsonString = JSON.stringify(data)
  const { iv, ciphertext } = await encrypt(jsonString, key)
  return { iv, ciphertext, version: 1 }
}

/**
 * Descifra un objeto JSON completo desde IndexedDB.
 */
export async function decryptStore<T>(
  encrypted: { iv: string; ciphertext: string },
  key: CryptoKey
): Promise<T> {
  const jsonString = await decrypt(encrypted.iv, encrypted.ciphertext, key)
  return JSON.parse(jsonString) as T
}

// ============================================================================
// Helpers
// ============================================================================

function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i])
  }
  return btoa(binary)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i)
  }
  return arr
}
