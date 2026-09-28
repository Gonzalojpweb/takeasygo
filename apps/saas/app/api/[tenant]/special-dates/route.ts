import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAdminRole } from '@/lib/apiAuth'

interface SpecialDateRule {
  id: string
  name: string
  date: { month: number; day: number }
  triggerItems: string[]
  suggestedItems: string[]
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const rules = tenant.specialDates || []
    return NextResponse.json({ rules })
  } catch (error) {
    console.error('Error fetching special dates:', error)
    return NextResponse.json({ error: 'Error fetching special dates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params

    // Orden de seguridad: resolver tenant y autenticar ANTES de tocar el body.
    // Nunca devolver errores de validación a un caller no autenticado.
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { name, date, triggerItems, suggestedItems } = body

    if (
      typeof name !== 'string' || name.trim().length === 0 || name.length > 100 ||
      !date || !Number.isInteger(date.month) || !Number.isInteger(date.day) ||
      date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31 ||
      !Array.isArray(triggerItems) || triggerItems.length === 0 ||
      !Array.isArray(suggestedItems) || suggestedItems.length === 0 ||
      triggerItems.length > 50 || suggestedItems.length > 50 ||
      [...triggerItems, ...suggestedItems].some((i: unknown) => typeof i !== 'string' || i.length > 100)
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const newRule: SpecialDateRule = {
      id: crypto.randomUUID(),
      name,
      date,
      triggerItems,
      suggestedItems,
    }

    const specialDates = tenant.specialDates || []
    specialDates.push(newRule)

    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { specialDates } }
    )

    return NextResponse.json({ success: true, rule: newRule })
  } catch (error) {
    console.error('Error saving special date:', error)
    return NextResponse.json({ error: 'Error saving special date' }, { status: 500 })
  }
}
