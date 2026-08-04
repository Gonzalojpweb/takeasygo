import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { escapeRegex } from '@takeasygo/business'
import { superadminCreateUserSchema } from '@/lib/schemas'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const search = searchParams.get('search') ?? ''
    const role = searchParams.get('role') ?? ''
    const status = searchParams.get('status') ?? ''

    await connectDB()

    const filter: Record<string, any> = { role: { $ne: 'superadmin' } }

    if (role) filter.role = role
    if (status === 'active') filter.isActive = true
    else if (status === 'inactive') filter.isActive = false

    if (search.trim()) {
      const re = new RegExp(escapeRegex(search.trim()), 'i')
      filter.$or = [
        { name: re },
        { email: re },
      ]
    }

    const skip = (page - 1) * limit

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetToken -resetTokenExpiry')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ])

    const activeCount = await User.countDocuments({
      role: { $ne: 'superadmin' },
      isActive: true,
    })

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        total,
        active: activeCount,
      },
    })
  } catch (error) {
    console.error('[superadmin/users GET]', error)
    return NextResponse.json({ error: 'Error al obtener usuarios' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const parsed = superadminCreateUserSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { name, email, password, role, tenantId } = parsed.data

    await connectDB()

    const existing = await User.findOne({ email })
    if (existing) return NextResponse.json({ error: 'El email ya está en uso' }, { status: 400 })

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await User.create({ name, email, password: hashedPassword, role, tenantId })

    return NextResponse.json({ user }, { status: 201 })
  } catch (_error) {
    console.error('[superadmin/users POST]', _error)
    return NextResponse.json({ error: 'Error al crear el usuario' }, { status: 500 })
  }
}
