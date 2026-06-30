import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  const { tenantId } = await params
  const { email } = await request.json()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  await connectDB()

  // Verificar que el email no esté en uso por otro usuario
  const existing = await User.findOne({ email: email.toLowerCase().trim() }).lean()
  if (existing && (existing as any).tenantId?.toString() !== tenantId) {
    return NextResponse.json({ error: 'Ese email ya está en uso por otro usuario' }, { status: 409 })
  }

  // Actualizar el admin del tenant (role: admin, tenantId)
  const updated = await User.findOneAndUpdate(
    { tenantId, role: 'admin' },
    { $set: { email: email.toLowerCase().trim() } },
    { new: true }
  ).select('email name')

  if (!updated) {
    return NextResponse.json({ error: 'Admin del tenant no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ email: updated.email })
}
