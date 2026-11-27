// Piezas comunes de las rutas del consumidor (/api/user/network/*, etapa 5).
import { NextResponse } from 'next/server'
import { getIdentitySession } from '@/lib/tenant-access'
import { BenefitError } from './engine'

export async function consumerUserId(): Promise<string | null> {
  const session = await getIdentitySession()
  return session?.user?.id ?? null
}

export function benefitErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof BenefitError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  console.error(`[network/benefits] ${where}:`, err instanceof Error ? err.message : err)
  return NextResponse.json({ error: 'Error interno' }, { status: 500 })
}
