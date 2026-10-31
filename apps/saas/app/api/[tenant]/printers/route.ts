import { connectDB } from '@/lib/mongoose'
import { rolesForDocuments, validatePrinterDocuments } from '@takeasygo/business'
import { printerLimitError } from '@/lib/printers/limits'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { requireAuth, getSessionUser, requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation } from '@/lib/location-scope'
import mongoose from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const locationId = request.nextUrl.searchParams.get('locationId')
    const filter: Record<string, any> = { tenantId: tenant._id }
    if (locationId) {
      if (!mongoose.Types.ObjectId.isValid(locationId)) {
        return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
      }
      const sedeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
      if (sedeError) return sedeError
      filter.locationId = locationId
    } else {
      // Sin sede pedida: un usuario con sedes asignadas solo ve las suyas.
      const user = await getSessionUser(request)
      const scoped = user?.role === 'superadmin' ? [] : (user?.assignedLocations ?? [])
      if (scoped.length > 0) filter.locationId = { $in: scoped }
    }

    const printers = await Printer.find(filter).sort({ createdAt: 1 })
    return NextResponse.json({ printers })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener impresoras' }, { status: 500 })
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
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'printjobs.manage',
    })
    if (permError) return permError

    const body = await request.json()
    const { locationId, name, connectionType, ip, port, roles, paperWidth } = body

    // Fase 1 (29/10): documentos por impresora. Sin POS, solo comandas y
    // tickets no fiscales.
    let documents: string[] = []
    if (body.documents !== undefined) {
      const v = validatePrinterDocuments(body.documents, Boolean(tenant.features?.posEnabled))
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      documents = v.documents
    }

    if (!locationId || !name || !ip) {
      return NextResponse.json({ error: 'locationId, name e ip son obligatorios' }, { status: 400 })
    }

    // P-3: la sede debe pertenecer a este tenant (impedir crear
    // impresoras apuntando a sedes de otro negocio).
    const location = await Location.exists({ _id: locationId, tenantId: tenant._id })
    if (!location) {
      return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    }
    const sedeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
    if (sedeError) return sedeError

    // Límite por plan (impresoras activas por sede).
    const limitError = await printerLimitError(tenant, locationId)
    if (limitError) return limitError

    const uid = `MANUAL-${ip.replace(/\./g, '-')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`

    const printer = await Printer.create({
      tenantId: tenant._id,
      locationId,
      uid,
      name,
      connectionType: connectionType ?? 'tcp',
      ip,
      port: port ?? 9100,
      roles: documents.length ? rolesForDocuments(documents as never, roles ?? []) : roles ?? ['kitchen'],
      documents,
      paperWidth: paperWidth ?? 80,
    })

    return NextResponse.json({ printer }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear impresora' }, { status: 500 })
  }
}
