import { connectDB } from '@/lib/mongoose'
import DeliveryPerson from '@/models/DeliveryPerson'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const person = await DeliveryPerson.findOne({
      _id: id,
      tenantId: tenant._id,
    }).select('-tokenHash').lean()

    if (!person) {
      return NextResponse.json({ error: 'Delivery no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10))
    const skip = (page - 1) * limit

    const personObjectId = new mongoose.Types.ObjectId(id)

    const baseFilter = {
      tenantId: tenant._id,
      'deliveryConfirmation.deliveryPersonId': personObjectId,
    }

    // Fetch trips + stats in parallel
    const [trips, total, statsAgg] = await Promise.all([
      Order.find(baseFilter)
        .select(
          'orderNumber status total deliveryCost deliveryDistance deliveryAddress customer createdAt statusTimestamps deliveryConfirmation'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(baseFilter),
      Order.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            totalTrips: { $sum: 1 },
            completedTrips: {
              $sum: {
                $cond: [{ $eq: ['$deliveryConfirmation.status', 'completed'] }, 1, 0],
              },
            },
            disputedTrips: {
              $sum: {
                $cond: [{ $eq: ['$deliveryConfirmation.status', 'disputed'] }, 1, 0],
              },
            },
            totalRevenue: { $sum: '$total' },
            totalDeliveryCost: { $sum: '$deliveryCost' },
            totalDistance: { $sum: '$deliveryDistance' },
            avgDeliveryCost: { $avg: '$deliveryCost' },
            avgDistance: { $avg: '$deliveryDistance' },
          },
        },
      ]),
    ])

    const stats = statsAgg[0] || {
      totalTrips: 0,
      completedTrips: 0,
      disputedTrips: 0,
      totalRevenue: 0,
      totalDeliveryCost: 0,
      totalDistance: 0,
      avgDeliveryCost: 0,
      avgDistance: 0,
    }

    return NextResponse.json({
      person: JSON.parse(JSON.stringify(person)),
      trips: JSON.parse(JSON.stringify(trips)),
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    })
  } catch (error) {
    console.error('[delivery/trips]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
