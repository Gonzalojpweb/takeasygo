import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import CorporateAccount from '@/models/CorporateAccount'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { checkIsOpenNow } from '@/lib/service-hours'
import mongoose from 'mongoose'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const corporateAccountId = searchParams.get('corporateAccountId')
    const callerEmail = searchParams.get('email')

    if (!corporateAccountId) {
      return NextResponse.json({ error: 'corporateAccountId requerido' }, { status: 400 })
    }

    // Security: caller email is required to verify membership
    if (!callerEmail) {
      return NextResponse.json({ error: 'Email del llamador requerido' }, { status: 400 })
    }

    // Validate corporateAccountId is a valid ObjectId
    if (!/^[0-9a-fA-F]{24}$/.test(corporateAccountId)) {
      return NextResponse.json({ error: 'corporateAccountId inválido' }, { status: 400 })
    }

    await connectDB()

    // Query using native driver to handle string _id (legacy data in corporateaccounts)
    const db = mongoose.connection.db!
    const account = await db.collection('corporateaccounts').findOne({ _id: corporateAccountId })
    if (!account || account.status !== 'active') {
      return NextResponse.json({ error: 'Cuenta corporativa no encontrada o inactiva' }, { status: 404 })
    }

    // Security: verify caller email belongs to this corporate account
    const normalizedCallerEmail = callerEmail.toLowerCase().trim()
    const isAdmin = account.companyAdminEmail === normalizedCallerEmail
    const isEmployee = (account.employeeEmails || []).map((e: string) => e.toLowerCase().trim()).includes(normalizedCallerEmail)

    if (!isAdmin && !isEmployee) {
      return NextResponse.json({ error: 'No tenés acceso a esta cuenta corporativa' }, { status: 403 })
    }

    // Resolve tenants based on accessMode
    let tenants: any[]
    if (account.accessMode === 'all') {
      tenants = await Tenant.find({ isActive: true }).select('_id name slug business logoUrl heroImageUrl').lean()
    } else {
      tenants = await Tenant.find({
        _id: { $in: account.tenantIds },
        isActive: true,
      }).select('_id name slug business logoUrl heroImageUrl').lean()
    }

    // Get all locations for these tenants
    const tenantIds = tenants.map((t: any) => t._id)
    const locations = await Location.find({
      tenantId: { $in: tenantIds },
      isActive: true,
    }).select('tenantId name slug address coordinates serviceHours orderModes cuisineTypes deliveryConfig timezone').lean()

    // Build tenant lookup
    const tenantMap = Object.fromEntries(tenants.map((t: any) => [t._id.toString(), t]))

    // Build restaurant list
    const restaurants = locations.map((loc: any) => {
      const tenant = tenantMap[loc.tenantId.toString()]
      const orderModes = loc.orderModes || []
      const hasDelivery = orderModes.includes('delivery')
      const hasBusiness = orderModes.includes('business')
      const isOpenNow = checkIsOpenNow(loc.serviceHours, 'takeaway', loc.timezone)

      return {
        tenantId: loc.tenantId.toString(),
        tenantName: tenant?.name || 'Desconocido',
        tenantSlug: tenant?.slug || '',
        tenantLogoUrl: tenant?.logoUrl || '',
        locationId: loc._id.toString(),
        locationName: loc.name,
        locationSlug: loc.slug,
        address: loc.address,
        coordinates: loc.coordinates || null,
        cuisineTypes: loc.cuisineTypes || [],
        isOpenNow,
        hasDelivery,
        hasBusiness,
        businessEnabled: tenant?.business?.enabled ?? false,
      }
    })

    // Filter: only tenants with business enabled
    const businessEnabled = restaurants.filter((r: any) => r.businessEnabled)

    return NextResponse.json({
      restaurants: businessEnabled,
      total: businessEnabled.length,
      accessMode: account.accessMode,
    })
  } catch (error) {
    console.error('[corporate-restaurants]', error)
    return NextResponse.json({ error: 'Error al obtener restaurantes' }, { status: 500 })
  }
}
