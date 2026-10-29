import { connectDB } from '@/lib/mongoose'
import { rolesForDocuments, validatePrinterDocuments } from '@takeasygo/business'
import { printerLimitError } from '@/lib/printers/limits'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation } from '@/lib/location-scope'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; printerId: string }> }
) {
  try {
    const { tenant: tenantSlug, printerId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'printjobs.manage',
    })
    if (permError) return permError

    const body = await request.json()
    const { name, connectionType, ip, port, roles, paperWidth, isActive } = body

    const updateData: any = { name, connectionType, ip, port, roles, paperWidth, isActive };
    if (body.printSettings) updateData.printSettings = body.printSettings;
    if (body.documents !== undefined) {
      const v = validatePrinterDocuments(body.documents, Boolean(tenant.features?.posEnabled))
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      updateData.documents = v.documents
    }

    // Sede de la impresora: un usuario con sedes asignadas no edita
    // impresoras de otra sede (404 sin filtrar existencia).
    const existing = await Printer.findOne({ _id: printerId, tenantId: tenant._id }).select('locationId isActive roles').lean<{ locationId: unknown; isActive: boolean; roles?: string[] }>()
    if (!existing) return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })
    const sedeError = await guardRequestLocation(request, existing.locationId, 'Impresora no encontrada')
    if (sedeError) return sedeError

    // Los roles (agente de impresión) siguen a los documentos; se conserva barra.
    if (updateData.documents) {
      updateData.roles = rolesForDocuments(updateData.documents, Array.isArray(roles) ? roles : existing.roles ?? [])
    }

    // Reactivar cuenta contra el límite del plan.
    if (isActive === true && !existing.isActive) {
      const limitError = await printerLimitError(tenant, existing.locationId, printerId)
      if (limitError) return limitError
    }

    const printer = await Printer.findOneAndUpdate(
      { _id: printerId, tenantId: tenant._id },
      { $set: updateData },
      { new: true, runValidators: true }
    )

    if (!printer) return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })

    return NextResponse.json({ printer })
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar impresora' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; printerId: string }> }
) {
  try {
    const { tenant: tenantSlug, printerId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'printjobs.manage',
    })
    if (permError) return permError

    const existing = await Printer.findOne({ _id: printerId, tenantId: tenant._id }).select('locationId').lean<{ locationId: unknown }>()
    if (!existing) return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })
    const sedeError = await guardRequestLocation(request, existing.locationId, 'Impresora no encontrada')
    if (sedeError) return sedeError

    const printer = await Printer.findOneAndDelete({ _id: printerId, tenantId: tenant._id })
    if (!printer) return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })

    return NextResponse.json({ message: 'Impresora eliminada' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar impresora' }, { status: 500 })
  }
}
