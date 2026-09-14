import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import CustomerProfile from '@/models/CustomerProfile'
import { safeDecrypt } from '@/lib/crypto'
import { canAccess } from '@/lib/plans'
import { requireAuth } from '@/lib/apiAuth'
import {
  getAuthenticatedClient,
  listAllConnections,
  buildDedupMap,
  dedupContacts,
  transformConsumerToGoogle,
  batchCreateContacts,
} from '@/lib/google-contacts'

const MAX_CONTACTS_PER_RUN = 10_000
const PAGE_SIZE = 500

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    if (!tenant.googleContacts?.isConnected) {
      return NextResponse.json({ error: 'Google Contacts no conectado.' }, { status: 400 })
    }

    const auth = await getAuthenticatedClient(tenant._id)
    if (!auth) {
      return NextResponse.json({ error: 'No se pudo autenticar con Google.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { source, tags, isLoyaltyMember, segment, dryRun } = body as {
      source?: string
      tags?: string[]
      isLoyaltyMember?: boolean
      segment?: string
      dryRun?: boolean
    }

    // ── 1. Build consumer filter ──────────────────────────────────────────
    const consumerFilter: Record<string, any> = { tenantIds: tenant._id }

    if (source) {
      consumerFilter.source = source
    }

    if (tags && tags.length > 0) {
      consumerFilter.tags = { $all: tags }
    }

    if (typeof isLoyaltyMember === 'boolean') {
      consumerFilter.isLoyaltyMember = isLoyaltyMember
    }

    // Segment filter: two-phase query via CustomerProfile
    let segmentPhoneHashes: string[] | null = null
    if (segment) {
      const segments = segment.split(',').map(s => s.trim()).filter(Boolean)
      const cisFilter: Record<string, any> = { tenantId: tenant._id }
      cisFilter.segment = segments.length === 1 ? segments[0] : { $in: segments }

      const profiles = await CustomerProfile.find(cisFilter)
        .select({ phoneHash: 1 })
        .lean()

      segmentPhoneHashes = profiles.map((p: any) => p.phoneHash)
      if (segmentPhoneHashes.length === 0) {
        return NextResponse.json({ created: 0, skipped: 0, total: 0, dryRun: !!dryRun })
      }
      consumerFilter.phoneHash = { $in: segmentPhoneHashes }
    }

    // ── 2. Fetch existing Google contacts for dedup ───────────────────────
    const existingGoogleContacts = await listAllConnections(auth)
    const dedupMap = buildDedupMap(existingGoogleContacts)

    // ── 3. Query consumers (paginated, capped at MAX) ─────────────────────
    let allConsumers: any[] = []
    let skip = 0
    let hasMore = true

    while (hasMore && allConsumers.length < MAX_CONTACTS_PER_RUN) {
      const batch = await Consumer.find(consumerFilter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(PAGE_SIZE)
        .lean()

      if (batch.length === 0) { hasMore = false; break }
      allConsumers.push(...batch)
      skip += PAGE_SIZE
      if (batch.length < PAGE_SIZE) hasMore = false
    }

    // ── 4. Decrypt PII + transform ────────────────────────────────────────
    const candidates = allConsumers.map((c) => {
      const name = safeDecrypt(c.name) || ''
      const phone = safeDecrypt(c.phone) || ''
      const email = safeDecrypt(c.email) || ''
      return transformConsumerToGoogle({ name, phone, email })
    })

    // ── 5. Dedup ──────────────────────────────────────────────────────────
    const { toCreate, skipped } = dedupContacts(candidates, dedupMap)

    // ── 6. Create or dry-run ──────────────────────────────────────────────
    let created = 0
    let errors = 0

    if (!dryRun && toCreate.length > 0) {
      const result = await batchCreateContacts(auth, toCreate)
      created = result.created
      errors = result.errors
    }

    // ── 7. Update lastSyncAt ──────────────────────────────────────────────
    if (!dryRun) {
      await Tenant.updateOne({ _id: tenant._id }, { $set: { 'googleContacts.lastSyncAt': new Date() } })
    }

    return NextResponse.json({
      created,
      skipped,
      total: allConsumers.length,
      errors,
      dryRun: !!dryRun,
    })
  } catch (error: any) {
    console.error('[google-contacts-sync] error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
