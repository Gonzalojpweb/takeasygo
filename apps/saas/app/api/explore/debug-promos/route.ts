import { NextResponse, type NextRequest } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import mongoose from 'mongoose'

/**
 * GET /api/explore/debug-promos?tenantSlug=xxx
 *
 * Debug endpoint: shows ALL promotions for a tenant with filtering analysis.
 * Shows which promos pass the real query and which don't, and why.
 *
 * TEMPORAL — solo para diagnóstico. Eliminar en producción.
 */

export async function GET(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenantSlug')
    if (!tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug query param required' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) {
      return NextResponse.json({ error: `Tenant "${tenantSlug}" not found or inactive` }, { status: 404 })
    }

    // Get all locations for this tenant
    const locations = await Location.find({ tenantId: tenant._id, isActive: true })
      .select('_id address geo.coordinates')
      .lean() as any[]

    const locationIds = locations.map(l => l._id)
    const now = new Date()

    // Get ALL promotions for this tenant (both scope tenant and scope global)
    const allPromos = await Promotion.find({
      $or: [
        { scope: 'tenant', tenantId: tenant._id },
        { scope: 'global', targetTenants: tenant._id },
      ],
    }).lean() as any[]

    const analysis = allPromos.map((promo: any) => {
      const reasons: string[] = []
      let passes = true

      // Check 1: isActive
      if (!promo.isActive) {
        reasons.push('isActive is FALSE')
        passes = false
      }

      // Check 2: scheduledStart in future
      if (promo.scheduledStart && new Date(promo.scheduledStart) > now) {
        reasons.push(`scheduledStart is FUTURE (${promo.scheduledStart})`)
        passes = false
      }

      // Check 3: scheduledEnd in past
      if (promo.scheduledEnd && new Date(promo.scheduledEnd) < now) {
        reasons.push(`scheduledEnd is PAST (${promo.scheduledEnd})`)
        passes = false
      }

      // Check 4: maxRedemptions reached
      if (promo.maxRedemptions != null && promo.redemptionsCount >= promo.maxRedemptions) {
        reasons.push(`redemptionsCount (${promo.redemptionsCount}) >= maxRedemptions (${promo.maxRedemptions})`)
        passes = false
      }

      // Check 5: scope/tenant matching
      if (promo.scope === 'tenant') {
        if (!promo.tenantId) {
          reasons.push('scope=tenant but no tenantId')
          passes = false
        }
      }

      // Check 6: scope/global with no matching tenants
      if (promo.scope === 'global' && promo.targetTenants?.length > 0) {
        const hasMatch = promo.targetTenants.some((tid: any) => tid.toString() === tenant._id.toString())
        if (!hasMatch) {
          reasons.push(`targetTenants does not include this tenant`)
          passes = false
        }
      }

      // Check 7: locationId mismatch
      if (promo.locationId && !locationIds.some(lid => lid.toString() === promo.locationId?.toString())) {
        reasons.push(`locationId (${promo.locationId}) not in active locations`)
        passes = false
      }

      // Check 8: activeTimeStart/End (NOT checked by API but note it)
      const hasTimeWindow = promo.activeTimeStart || promo.activeTimeEnd
      if (hasTimeWindow) {
        reasons.push(`NOTE: has activeTimeStart/End but API does NOT check these`)
      }

      if (passes && reasons.length === 0) {
        reasons.push('PASSES ALL FILTERS')
      }

      return {
        id: promo._id?.toString(),
        title: promo.title,
        type: promo.type,
        scope: promo.scope,
        isActive: promo.isActive,
        scheduledStart: promo.scheduledStart ?? null,
        scheduledEnd: promo.scheduledEnd ?? null,
        activeTimeStart: promo.activeTimeStart ?? null,
        activeTimeEnd: promo.activeTimeEnd ?? null,
        maxRedemptions: promo.maxRedemptions ?? null,
        redemptionsCount: promo.redemptionsCount ?? 0,
        tenantId: promo.tenantId?.toString() ?? null,
        locationId: promo.locationId?.toString() ?? null,
        targetTenants: promo.targetTenants?.map((t: any) => t.toString()) ?? [],
        slots: promo.slots?.length ?? 0,
        passesFilters: passes,
        reasons,
        createdAt: promo.createdAt,
      }
    })

    const passing = analysis.filter(p => p.passesFilters)
    const failing = analysis.filter(p => !p.passesFilters)

    return NextResponse.json({
      tenant: {
        id: tenant._id.toString(),
        slug: tenant.slug,
        name: tenant.name,
        isActive: tenant.isActive,
      },
      locations: locations.map(l => ({
        id: l._id.toString(),
        address: l.address,
        hasCoords: !!(l.geo?.coordinates?.[0] && l.geo?.coordinates?.[1]),
      })),
      now: now.toISOString(),
      total: allPromos.length,
      passing: passing.length,
      failing: failing.length,
      promos: analysis,
    })
  } catch (err) {
    console.error('[debug-promos] error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
