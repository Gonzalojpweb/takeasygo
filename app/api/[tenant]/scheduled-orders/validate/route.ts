import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { validateScheduledPickupTime } from '@/lib/scheduled-orders'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const validateSchema = z.object({
  locationId: z.string().min(1),
  scheduledPickupAt: z.string().datetime(),
  itemIds: z.array(z.string()).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const rawBody = await request.json()
    const parsed = validateSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { locationId, scheduledPickupAt, itemIds } = parsed.data

    let menuItems: Array<{
      availabilityMode: 'always' | 'scheduled' | undefined
      availabilitySchedule: any[] | undefined
    }> | undefined

    if (itemIds && itemIds.length > 0) {
      const menu = await Menu.findOne({ tenantId: tenant._id, locationId, isActive: true }).lean()
      if (menu) {
        menuItems = []
        for (const category of menu.categories) {
          if (!category.isAvailable) continue
          for (const item of category.items) {
            if (itemIds.includes(item._id.toString())) {
              menuItems.push({
                availabilityMode: item.availabilityMode,
                availabilitySchedule: item.availabilitySchedule,
              })
            }
          }
        }
      }
    }

    const result = await validateScheduledPickupTime(locationId, new Date(scheduledPickupAt), menuItems)

    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('[scheduled-orders/validate] Error:', error)
    return NextResponse.json({ error: 'Error al validar horario' }, { status: 500 })
  }
}
