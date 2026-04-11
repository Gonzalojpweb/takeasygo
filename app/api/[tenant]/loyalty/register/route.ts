// POST /api/[tenant]/loyalty/register
// Registro público vía QR — sin autenticación requerida, con rate limiting básico
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { NextRequest, NextResponse } from 'next/server'
import { canAccess, LOYALTY_MEMBER_LIMIT } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import crypto from 'crypto'

// Rate limiting simple en memoria (para Next.js serverless usar Upstash en producción)
const ipCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 3
const RATE_WINDOW_MS = 10 * 60 * 1000 // 10 minutos

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipCounts.get(ip)
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function hashPhone(phone: string): string {
  const normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    // Rate limiting por IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Esperá un momento e intentá de nuevo.' },
        { status: 429 }
      )
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('name plan loyalty')
      .lean<{ _id: any; name: string; plan: Plan; loyalty: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    // Verificar que el plan tiene acceso al club
    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Este restaurante no tiene el club activo' }, { status: 403 })
    }

    // El club debe estar habilitado por el restaurante
    if (!tenant.loyalty?.enabled) {
      return NextResponse.json({ error: 'El club aún no está activo para este restaurante' }, { status: 403 })
    }

    const body = await request.json()
    const { name, phone, email, birthDate } = body

    if (!name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Nombre y teléfono son requeridos' }, { status: 400 })
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

    // Sanitizar
    const cleanName  = String(name).trim().slice(0, 100)
    const cleanPhone = String(phone).trim().slice(0, 30)
    const cleanEmail = email ? String(email).trim().toLowerCase().slice(0, 200) : ''
    const pHash      = hashPhone(cleanPhone)

    // Verificar si ya existe (deduplicación por phoneHash + tenant)
    const existing = await LoyaltyMember.findOne({
      tenantId:  tenant._id,
      phoneHash: pHash,
    }).lean<{ _id: any; name: string; joinedAt: Date; birthDate?: Date }>()

    if (existing) {
      // Si se proporciona birthDate y el miembro no lo tiene, actualizarlo
      if (parsedBirthDate && !existing.birthDate) {
        await LoyaltyMember.updateOne(
          { _id: existing._id },
          { birthDate: parsedBirthDate }
        )
      }

      // Devuelve la tarjeta existente — no error
      const clubName = tenant.loyalty?.clubName?.trim() || `Club ${tenant.name}`
      return NextResponse.json({
        alreadyMember: true,
        member: {
          id:       existing._id.toString(),
          name:     existing.name,
          joinedAt: existing.joinedAt,
          clubName,
          welcomeMessage: tenant.loyalty?.welcomeMessage?.trim() ||
            '¡Ya sos parte del club! Próximamente tendremos beneficios para vos.',
        },
      })
    }

    // Verificar límite de miembros según plan
    const limit = LOYALTY_MEMBER_LIMIT[tenant.plan]
    if (limit !== null) {
      const count = await LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'active' })
      if (count >= limit) {
        return NextResponse.json(
          { error: 'El club alcanzó su capacidad máxima. Contactá al restaurante.' },
          { status: 409 }
        )
      }
    }

    // Crear miembro
    const member = await LoyaltyMember.create({
      tenantId:  tenant._id,
      name:      cleanName,
      phone:     cleanPhone,
      email:     cleanEmail,
      birthDate: parsedBirthDate,
      phoneHash: pHash,
      status:    'active',
      source:    'qr_scan',
    })

    const clubName = tenant.loyalty?.clubName?.trim() || `Club ${tenant.name}`
    const welcomeMessage = tenant.loyalty?.welcomeMessage?.trim() ||
      `¡Bienvenido/a a ${clubName}! Próximamente tendremos beneficios exclusivos para vos.`

    return NextResponse.json({
      alreadyMember: false,
      member: {
        id:             member._id.toString(),
        name:           member.name,
        joinedAt:       member.createdAt,
        clubName,
        welcomeMessage,
      },
    }, { status: 201 })

  } catch (error: any) {
    // Error de índice único (race condition de doble registro)
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'Ya sos miembro de este club.' }, { status: 409 })
    }
    console.error('[loyalty/register]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// GET /api/[tenant]/loyalty/register?phone=XX — verificar si ya es miembro (para el QR)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const phone = request.nextUrl.searchParams.get('phone')

    if (!phone) return NextResponse.json({ isMember: false })

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty name')
      .lean<{ _id: any; plan: Plan; loyalty: any; name: string }>()

    if (!tenant) return NextResponse.json({ isMember: false })

    const pHash = hashPhone(phone)
    const member = await LoyaltyMember.findOne({
      tenantId:  tenant._id,
      phoneHash: pHash,
      status:    'active',
    }).lean<{ _id: any; name: string; joinedAt: Date }>()

    const clubName = tenant.loyalty?.clubName?.trim() || `Club ${tenant.name}`

    return NextResponse.json({
      isMember: !!member,
      member: member ? {
        id:       member._id.toString(),
        name:     member.name,
        joinedAt: member.joinedAt,
        clubName,
      } : null,
    })
  } catch (error) {
    return NextResponse.json({ isMember: false })
  }
}
