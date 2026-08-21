import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'

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

    const rules = (tenant as any).specialDates || []
    return NextResponse.json({ rules })
  } catch (error) {
    console.error('Error fetching special dates:', error)
    return NextResponse.json({ error: 'Error fetching special dates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params

    const body = await request.json()
    const { name, date, triggerItems, suggestedItems } = body

    if (!name || !date || !triggerItems?.length || !suggestedItems?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const newRule: SpecialDateRule = {
      id: crypto.randomUUID(),
      name,
      date,
      triggerItems,
      suggestedItems,
    }

    const specialDates = (tenant as any).specialDates || []
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
