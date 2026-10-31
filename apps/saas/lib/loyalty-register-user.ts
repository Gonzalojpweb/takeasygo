// ============================================================================
// loyalty-register-user.ts — User de un socio que se registra en un club
// ============================================================================
// Hotfix de seguridad S1 (31/10/2026). Los registros al club son públicos y no
// verifican el celular. Antes, /loyalty/register sobrescribía el email y el
// celular del User que encontraba (toma de cuenta vía "olvidé mi contraseña")
// y /promotions/loyalty-register vinculaba por celular solo y devolvía el
// nombre y email de ese User. Reglas:
//   - NUNCA se modifica un User existente.
//   - Se vincula solo si el email coincide y el celular del User está vacío o
//     es el mismo (y no pertenece a otro User).
//   - Cualquier otra coincidencia → sin User: el socio queda huérfano y se
//     vincula cuando la persona entra con su email (auth.config, signIn).
// ============================================================================

import type { Types } from 'mongoose'
import User from '@/models/User'

export interface RegisterIdentity {
  name: string
  email: string
  phone: string
}

/**
 * Valida y normaliza nombre, email y celular del body. Solo strings: un objeto
 * ({ "$gt": "" }) llegaría como operador a las consultas. null = inválido.
 */
export function parseRegisterIdentity(body: Record<string, unknown>): RegisterIdentity | null {
  if (typeof body.name !== 'string' || typeof body.email !== 'string' || typeof body.phone !== 'string') {
    return null
  }
  const identity = {
    name: body.name.trim(),
    email: body.email.toLowerCase().trim(),
    phone: body.phone.trim(),
  }
  if (!identity.name || !identity.email || !identity.phone) return null
  return identity
}

/** User al que se vincula el socio nuevo (ver reglas arriba). Crea el User solo si ni el email ni el celular existen. */
export async function resolveRegisterUserId(input: RegisterIdentity): Promise<Types.ObjectId | null> {
  const [byEmail, byPhone] = await Promise.all([
    User.findOne({ email: input.email }).select('_id phone').lean<{ _id: Types.ObjectId; phone?: string | null }>(),
    User.findOne({ phone: input.phone }).select('_id').lean<{ _id: Types.ObjectId }>(),
  ])
  if (byEmail) {
    const samePhoneOrEmpty = !byEmail.phone || byEmail.phone === input.phone
    const phoneIsTheirsOrFree = !byPhone || String(byPhone._id) === String(byEmail._id)
    return samePhoneOrEmpty && phoneIsTheirsOrFree ? byEmail._id : null
  }
  if (byPhone) return null
  const created = await User.create({
    name: input.name,
    phone: input.phone,
    email: input.email,
    role: 'consumer',
    isActive: true,
  })
  return created._id as Types.ObjectId
}
