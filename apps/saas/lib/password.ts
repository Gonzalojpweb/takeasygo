/**
 * lib/password.ts
 * Reglas de contraseña del alta de onboarding. Se usan en el cliente (checklist
 * visual) y en el server (zod), para que lo que ve el usuario sea exactamente lo
 * que valida la API.
 */

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

/**
 * Normaliza a NFC y elimina caracteres de control invisibles.
 * Un usuario puede pegar un password con \r\n o \0 que rompería el hash sin
 * aportar nada; se descartan antes de validar.
 */
export function sanitizePassword(raw: string): string {
  return (raw ?? '').normalize('NFC').replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
}

export interface PasswordRules {
  length: boolean
  letter: boolean
  number: boolean
}

export function passwordRules(pw: string): PasswordRules {
  return {
    length: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX,
    letter: /[a-zA-ZÀ-ɏ]/.test(pw),
    number: /\d/.test(pw),
  }
}

/** Devuelve el primer requisito incumplido, o null si la contraseña es válida. */
export function passwordError(raw: string): string | null {
  const pw = sanitizePassword(raw)
  const rules = passwordRules(pw)
  if (!rules.length) {
    return `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`
  }
  if (!rules.letter) return 'Debe incluir al menos una letra'
  if (!rules.number) return 'Debe incluir al menos un número'
  return null
}
