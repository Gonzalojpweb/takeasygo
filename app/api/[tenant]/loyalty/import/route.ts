import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'
import crypto from 'crypto'

function hashPhone(phone: string): string {
  const normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function parseCSV(csvText: string): { name: string; phone: string; email: string }[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
  const nameIdx  = headers.findIndex(h => ['name', 'nombre', 'cliente'].includes(h))
  const phoneIdx = headers.findIndex(h => ['phone', 'teléfono', 'telefono', 'celular'].includes(h))
  const emailIdx = headers.findIndex(h => ['email', 'correo', 'mail'].includes(h))

  if (nameIdx === -1 || phoneIdx === -1) return []

  const results: { name: string; phone: string; email: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
    const name  = values[nameIdx]  ?? ''
    const phone = values[phoneIdx] ?? ''
    const email = emailIdx !== -1 ? (values[emailIdx] ?? '') : ''

    if (name.trim()) {
      results.push({
        name:   name.trim().slice(0, 100),
        phone:  phone.replace(/\D/g, '').slice(0, 30),
        email:  email.toLowerCase().slice(0, 200),
      })
    }
  }

  return results
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    const body = await request.json()
    const { csv } = body

    if (!csv || typeof csv !== 'string') {
      return NextResponse.json({ error: 'CSV requerido' }, { status: 400 })
    }

    const rows = parseCSV(csv)

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron registros válidos. Asegúrate de incluir columnas "nombre" y "teléfono".' },
        { status: 400 }
      )
    }

    const existingHashes = await LoyaltyMember.find({ tenantId: tenant._id })
      .select('phoneHash')
      .lean<{ phoneHash: string }[]>()

    const existingSet = new Set(existingHashes.map(e => e.phoneHash))
    const newMembers: any[] = []
    const skipped: string[] = []

    for (const row of rows) {
      const pHash = row.phone ? hashPhone(row.phone) : ''

      if (!pHash) {
        skipped.push(`${row.name} (sin teléfono)`)
        continue
      }

      if (existingSet.has(pHash)) {
        skipped.push(`${row.name} (${row.phone})`)
        continue
      }

      newMembers.push({
        tenantId:  tenant._id,
        name:      row.name,
        phone:     row.phone,
        email:     row.email,
        phoneHash: pHash,
        status:    'active',
        source:    'manual_import',
      })
      existingSet.add(pHash)
    }

    if (newMembers.length > 0) {
      await LoyaltyMember.insertMany(newMembers, { ordered: false })
    }

    return NextResponse.json({
      imported: newMembers.length,
      skipped:  skipped.length,
      details:  skipped.slice(0, 10),
      message:  `${newMembers.length} miembros importados correctamente.`,
    })
  } catch (error: any) {
    console.error('[loyalty/import POST]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
