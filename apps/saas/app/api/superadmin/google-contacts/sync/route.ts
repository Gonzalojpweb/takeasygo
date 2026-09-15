import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import CustomerProfile from '@/models/CustomerProfile'
import { safeDecrypt } from '@/lib/crypto'
import { requireSuperAdmin } from '@/lib/apiAuth'
import {
  getAuthenticatedClientForUser,
  listAllConnections,
  buildDedupMap,
  dedupContacts,
  transformConsumerToGoogle,
  batchCreateContacts,
} from '@/lib/google-contacts'

const MAX_CONTACTS_PER_TENANT = 10_000
const PAGE_SIZE = 500
const DELAY_BETWEEN_TENANTS_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const user = await import('@/lib/apiAuth').then(m => m.getSessionUser(request))
    if (!user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const auth = await getAuthenticatedClientForUser(user.id)
    if (!auth) {
      return NextResponse.json({ error: 'Conectá tu Google account primero.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    let { tenantIds, source, tags, isLoyaltyMember, segment, dryRun } = body as {
      tenantIds?: string[]
      source?: string
      tags?: string[]
      isLoyaltyMember?: boolean
      segment?: string
      dryRun?: boolean
    }

    if (tenantIds && Array.isArray(tenantIds) && tenantIds.length > 0) {
      // Use explicitly provided tenant IDs
    } else {
      // Resolve all assigned tenants for this superadmin
      const assignedTenants = await Tenant.find({
        _id: { $in: user.assignedTenants || [] },
      })
        .select({ _id: 1 })
        .lean()
      tenantIds = assignedTenants.map((t) => t._id.toString())
    }

    if (!tenantIds || tenantIds.length === 0) {
      return NextResponse.json({ error: 'No hay tenants asignados para sincronizar' }, { status: 400 })
    }

    // ── 1. Fetch existing Google contacts for dedup (once, shared across tenants)
    const existingGoogleContacts = await listAllConnections(auth)
    const dedupMap = buildDedupMap(existingGoogleContacts)

    const results: Record<string, { created: number; skipped: number; total: number; errors: number }> = {}

    for (let i = 0; i < tenantIds.length; i++) {
      const tenantId = tenantIds[i]

      // Delay between tenants (rate limit)
      if (i > 0) {
        await sleep(DELAY_BETWEEN_TENANTS_MS)
      }

      const tenant = await Tenant.findById(tenantId).lean()
      if (!tenant) {
        results[tenantId] = { created: 0, skipped: 0, total: 0, errors: 0 }
        continue
      }

      // ── 2. Build consumer filter ────────────────────────────────────────
      const consumerFilter: Record<string, any> = { tenantIds: tenant._id }

      if (source) consumerFilter.source = source
      if (tags && tags.length > 0) consumerFilter.tags = { $all: tags }
      if (typeof isLoyaltyMember === 'boolean') consumerFilter.isLoyaltyMember = isLoyaltyMember

      // Segment filter
      if (segment) {
        const segments = segment.split(',').map(s => s.trim()).filter(Boolean)
        const cisFilter: Record<string, any> = { tenantId: tenant._id }
        cisFilter.segment = segments.length === 1 ? segments[0] : { $in: segments }

        const profiles = await CustomerProfile.find(cisFilter)
          .select({ phoneHash: 1 })
          .lean()

        const phoneHashes = profiles.map((p: any) => p.phoneHash)
        if (phoneHashes.length === 0) {
          results[tenantId] = { created: 0, skipped: 0, total: 0, errors: 0 }
          continue
        }
        consumerFilter.phoneHash = { $in: phoneHashes }
      }

      // ── 3. Query consumers (paginated, capped) ──────────────────────────
      let consumers: any[] = []
      let skip = 0
      let hasMore = true

      while (hasMore && consumers.length < MAX_CONTACTS_PER_TENANT) {
        const batch = await Consumer.find(consumerFilter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(PAGE_SIZE)
          .lean()

        if (batch.length === 0) { hasMore = false; break }
        consumers.push(...batch)
        skip += PAGE_SIZE
        if (batch.length < PAGE_SIZE) hasMore = false
      }

      // ── 4. Decrypt PII + transform ──────────────────────────────────────
      const candidates = consumers.map((c) => {
        const name = safeDecrypt(c.name) || ''
        const phone = safeDecrypt(c.phone) || ''
        const email = safeDecrypt(c.email) || ''
        return transformConsumerToGoogle({ name, phone, email })
      })

      // ── 5. Dedup (uses the shared map from step 1) ─────────────────────
      const { toCreate, skipped } = dedupContacts(candidates, dedupMap)

      // ── 6. Create or dry-run ────────────────────────────────────────────
      let created = 0
      let errors = 0

      if (!dryRun && toCreate.length > 0) {
        const result = await batchCreateContacts(auth, toCreate)
        created = result.created
        errors = result.errors

        // Add newly created to dedupMap so subsequent tenants don't re-create
        for (const c of toCreate) {
          if (c.phone) dedupMap.phones.add(c.phone)
          if (c.email) dedupMap.emails.add(c.email.toLowerCase().trim())
        }
      }

      results[tenantId] = { created, skipped, total: consumers.length, errors }
    }

    return NextResponse.json({ results, dryRun: !!dryRun })
  } catch (error: any) {
    console.error('[superadmin-google-contacts-sync] error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
