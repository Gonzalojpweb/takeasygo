import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { headers } from 'next/navigation'

interface SpecialDateRule {
  id: string
  name: string
  date: { month: number; day: number }
  triggerItems: string[]
  suggestedItems: string[]
}

export async function GET(request: Request, { params }: { params: { tenant: string } }) {
  try {
    const headersList = await headers()
    const tenantSlug = headersList.get('x-tenant-slug')

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

export async function POST(request: Request, { params }: { params: { tenant: string } }) {
  try {
    const headersList = await headers()
    const tenantSlug = headersList.get('x-tenant-slug')

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
