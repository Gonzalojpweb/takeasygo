import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import CorporateAccount from '@/models/CorporateAccount'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { checkIsOpenNow } from '@/lib/service-hours'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const corporateAccountId = searchParams.get('corporateAccountId')
    const callerEmail = searchParams.get('email')

    if (!corporateAccountId) {
      return NextResponse.json({ error: 'corporateAccountId requerido' }, { status: 400 })
    }

    if (!callerEmail) {
      return NextResponse.json({ error: 'Email del llamador requerido' }, { status: 400 })
    }

    if (!/^[0-9a-fA-F]{24}$/.test(corporateAccountId)) {
      return NextResponse.json({ error: 'corporateAccountId inválido' }, { status: 400 })
    }

    await connectDB()

    // Query by email fields (string-safe) then match corporateAccountId via toString().
    // This avoids the string _id vs ObjectId type mismatch in the corporateaccounts collection.
    const normalizedCallerEmail = callerEmail.toLowerCase().trim()
    const candidates = await CorporateAccount.find({
      $and: [
        { status: 'active' },
        { $or: [{ companyAdminEmail: normalizedCallerEmail }, { employeeEmails: normalizedCallerEmail }] },
      ],
    }).lean()

    const account = candidates.find(a => a._id.toString() === corporateAccountId)
    if (!account) {
      return NextResponse.json({ error: 'Cuenta corporativa no encontrada o sin acceso' }, { status: 404 })
    }

    const isAdmin = account.companyAdminEmail === normalizedCallerEmail
    if (!isAdmin) {
      const isEmployee = (account.employeeEmails || []).map((e: string) => e.toLowerCase().trim()).includes(normalizedCallerEmail)
      if (!isEmployee) {
        return NextResponse.json({ error: 'No tenés acceso a esta cuenta corporativa' }, { status: 403 })
      }
    }

    let tenants: any[]
    if (account.accessMode === 'all') {
      tenants = await Tenant.find({ isActive: true }).select('_id name slug business logoUrl heroImageUrl').lean()
    } else {
      tenants = await Tenant.find({
        _id: { $in: account.tenantIds },
        isActive: true,
      }).select('_id name slug business logoUrl heroImageUrl').lean()
    }

    const tenantIds = tenants.map((t: any) => t._id)
    const locations = await Location.find({
      tenantId: { $in: tenantIds },
      isActive: true,
    }).select('tenantId name slug address coordinates serviceHours orderModes cuisineTypes deliveryConfig timezone').lean()

    const tenantMap = Object.fromEntries(tenants.map((t: any) => [t._id.toString(), t]))

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
