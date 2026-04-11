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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = request.nextUrl

    const page     = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
    const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const search   = searchParams.get('search')   ?? ''
    const status   = searchParams.get('status')    ?? ''
    const source   = searchParams.get('source')    ?? ''
    const sortBy   = searchParams.get('sortBy')    ?? 'joinedAt'
    const sortOrder = searchParams.get('sortOrder') ?? 'desc'

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

    const filter: Record<string, any> = { tenantId: tenant._id }

    if (status && ['active', 'inactive', 'blocked'].includes(status)) {
      filter.status = status
    }
    if (source && ['checkout', 'qr_scan', 'admin', 'manual_import'].includes(source)) {
      filter.source = source
    }
    if (search.trim()) {
      const re = new RegExp(search.trim(), 'i')
      filter.$or = [
        { name: re },
        { phone: re },
        { email: re },
      ]
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1
    const sort: Record<string, 1 | -1> = { [sortBy]: sortDir }

    const skip = (page - 1) * limit

    const [members, total, totalActive] = await Promise.all([
      LoyaltyMember.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean<any[]>(),
      LoyaltyMember.countDocuments(filter),
      LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'active' }),
    ])

    const membersWithMaskedPhone = members.map(m => ({
      ...m,
      phone: m.phone ? maskPhone(m.phone) : '',
    }))

    return NextResponse.json({
      members: membersWithMaskedPhone,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        total,
        active: totalActive,
        inactive: total - totalActive,
      },
    })
  } catch (error) {
    console.error('[loyalty/members GET]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
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
    const { name, phone, email, birthDate, notes } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    // Validar birthDate si se proporciona
    let parsedBirthDate: Date | null = null
    if (birthDate) {
      const date = new Date(birthDate)
      if (isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Fecha de nacimiento inválida' }, { status: 400 })
      }

      // Verificar que no sea una fecha futura y que tenga sentido (mayor de 13 años, menor de 120)
      const now = new Date()
      const minDate = new Date(now.getFullYear() - 120, now.getMonth(), now.getDate())
      const maxDate = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate())

      if (date < minDate || date > maxDate) {
        return NextResponse.json({ error: 'Fecha de nacimiento fuera del rango válido' }, { status: 400 })
      }

      parsedBirthDate = date
    }

    const cleanName   = String(name).trim().slice(0, 100)
    const cleanPhone  = phone ? String(phone).trim().slice(0, 30) : ''
    const cleanEmail  = email ? String(email).trim().toLowerCase().slice(0, 200) : ''
    const phoneHash   = cleanPhone ? hashPhone(cleanPhone) : ''

    if (cleanPhone) {
      const existing = await LoyaltyMember.findOne({
        tenantId:  tenant._id,
        phoneHash,
      }).lean()

      if (existing) {
        return NextResponse.json(
          { error: 'Ya existe un miembro con este teléfono' },
          { status: 409 }
        )
      }
    }

    const member = await LoyaltyMember.create({
      tenantId:  tenant._id,
      name:      cleanName,
      phone:     cleanPhone,
      email:     cleanEmail,
      birthDate: parsedBirthDate,
      phoneHash,
      status:    'active',
      source:    'admin',
      notes:     notes?.trim().slice(0, 500) ?? '',
    })

    return NextResponse.json({ member }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'Ya existe un miembro con este teléfono' }, { status: 409 })
    }
    console.error('[loyalty/members POST]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****'
  const visible = phone.slice(-4)
  return `****${visible}`
}
