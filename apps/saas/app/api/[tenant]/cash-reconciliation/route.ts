import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getCashReconciliationSummary } from '@/lib/cash-reconciliation'

/**
 * GET /{tenant}/cash-reconciliation
 *
 * Returns a summary of orphaned cash orders for the admin dashboard.
 * Used by the reconciliation banner (same pattern as commission failures).
 */
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

    const daysBack = Number(request.nextUrl.searchParams.get('days')) || 7
    const summary = await getCashReconciliationSummary(tenant._id.toString(), daysBack)

    return NextResponse.json(summary)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
