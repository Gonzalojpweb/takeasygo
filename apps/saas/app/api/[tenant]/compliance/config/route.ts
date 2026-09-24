/**
 * API: Compliance Config
 *
 * GET: Retorna la configuración de compliance (lectura, diagnóstico)
 * PUT: Actualiza la configuración — solo superadmin
 *
 * /api/[tenant]/compliance/config?locationId=xxx
 */

import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { ComplianceConfigModel } from '@takeasygo/db/models/compliance-config'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const url = new URL(request.url)
    const locationId = url.searchParams.get('locationId')

    const filter: Record<string, unknown> = { tenantId: tenant._id }
    if (locationId) {
      filter.$or = [
        { locationId },
        { locationId: null },
      ]
    }

    const config = await ComplianceConfigModel.findOne(filter)
      .sort({ locationId: -1 })
      .lean()

    return NextResponse.json({ config: config ?? null })
  } catch (error) {
    console.error('[compliance/config GET] Error:', error)
    return NextResponse.json(
      { error: 'Error obteniendo configuración' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireSuperAdmin()
    if (authError) return authError

    const body = await request.json()
    const { locationId, slaRules, enabled, pilotMode } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId requerido' }, { status: 400 })
    }

    const config = await ComplianceConfigModel.findOneAndUpdate(
      {
        tenantId: tenant._id,
        locationId,
      },
      {
        $set: {
          slaRules: slaRules ?? [],
          enabled: enabled ?? true,
          pilotMode: pilotMode ?? false,
        },
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({ config })
  } catch (error) {
    console.error('[compliance/config PUT] Error:', error)
    return NextResponse.json(
      { error: 'Error guardando configuración' },
      { status: 500 }
    )
  }
}
