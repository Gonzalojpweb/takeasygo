/**
 * Cron Job: Google Contacts sync automático
 *
 * Se ejecuta periódicamente para sincronizar contactos de tenants
 * cuyo superadmin tiene Google Contacts conectado.
 *
 * Features:
 * - Incremental sync via lastSyncCursor (run-start timestamp, per tenant)
 * - Intra-tenant cursor: saved after each 500-consumer batch (no progress loss)
 * - User cursor: _id-based fan-out (remaining users picked up next run)
 * - Rate limit: 1s delay between users, 500ms between tenants
 * - 429 + 403 rateLimitExceeded retry with exponential backoff
 * - 10k cap per tenant
 * - MAX_USERS cap to avoid Vercel timeout
 *
 * URL: /api/cron/google-contacts-sync
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import PlatformConfig from '@/models/PlatformConfig'
import { safeDecrypt } from '@/lib/crypto'
import {
  getAuthenticatedClientForUser,
  listAllConnections,
  buildDedupMap,
  dedupContacts,
  transformConsumerToGoogle,
  batchCreateContacts,
} from '@/lib/google-contacts'

const CRON_SECRET = process.env.CRON_SECRET
const MAX_CONTACTS_PER_TENANT = 10_000
const PAGE_SIZE = 500
const MAX_USERS_PER_RUN = 50
const DELAY_BETWEEN_USERS_MS = 1_000
const DELAY_BETWEEN_TENANTS_MS = 500
const DELAY_BETWEEN_BATCHES_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Read persisted user cursor from PlatformConfig
    const platformConfig = await PlatformConfig.findById('platform')
      .select('gcSyncCursor')
      .lean() as any
    const lastUserCursorId: string | null = platformConfig?.gcSyncCursor?.lastUserId ?? null

    // User cursor: fetch users with _id > lastUserCursorId from previous run
    // First run or after full cycle: lastUserCursorId is null → starts from beginning
    const userFilter: Record<string, any> = {
      'googleContacts.isConnected': true,
      'googleContacts.refreshToken': { $ne: null },
      role: 'superadmin',
      isActive: true,
    }
    if (lastUserCursorId) {
      userFilter._id = { $gt: lastUserCursorId }
    }

    const connectedUsers = await User.find(userFilter)
      .select('_id name email googleContacts assignedTenants')
      .sort({ _id: 1 })
      .limit(MAX_USERS_PER_RUN)
      .lean()

    if (connectedUsers.length === 0) {
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        summary: { usersProcessed: 0, tenantsSynced: 0, hasMore: false },
        details: [],
      })
    }

    // Run-start timestamp: cursor for incremental sync
    // Consumers updatedAt > runStart will be picked up in the NEXT run
    const runStart = new Date()

    const allResults: Array<{
      userId: string
      userName: string
      connectedEmail: string | null
      tenants: Array<{
        tenantId: string
        tenantName: string
        created: number
        skipped: number
        total: number
        errors: number
        error: string | null
      }>
    }> = []

    let totalTenantsSynced = 0

    for (let userIdx = 0; userIdx < connectedUsers.length; userIdx++) {
      const user = connectedUsers[userIdx]

      // Delay between users (rate limit)
      if (userIdx > 0) {
        await sleep(DELAY_BETWEEN_USERS_MS)
      }

      try {
        const auth = await getAuthenticatedClientForUser(user._id.toString())
        if (!auth) {
          allResults.push({
            userId: user._id.toString(),
            userName: user.name,
            connectedEmail: user.googleContacts?.connectedEmail ?? null,
            tenants: [],
          })
          continue
        }

        // Determine which tenants to sync
        let tenantFilter: Record<string, any> = { status: 'active' }
        if (user.assignedTenants && user.assignedTenants.length > 0) {
          tenantFilter._id = { $in: user.assignedTenants }
        }

        const tenants = await Tenant.find(tenantFilter)
          .select('_id name slug googleContacts.lastSyncCursor')
          .lean()

        // Build shared dedup map from existing Google contacts
        const existingGoogleContacts = await listAllConnections(auth)
        const dedupMap = buildDedupMap(existingGoogleContacts)

        const tenantResults: Array<{
          tenantId: string
          tenantName: string
          created: number
          skipped: number
          total: number
          errors: number
          error: string | null
        }> = []

        for (let tenantIdx = 0; tenantIdx < tenants.length; tenantIdx++) {
          const tenant = tenants[tenantIdx]

          // Delay between tenants (rate limit)
          if (tenantIdx > 0) {
            await sleep(DELAY_BETWEEN_TENANTS_MS)
          }

          try {
            const cursor = (tenant as any).googleContacts?.lastSyncCursor
            let consumersProcessed = 0
            let totalCreated = 0
            let totalSkipped = 0
            let totalErrors = 0
            let tenantHasData = false

            // Stream consumers in pages of 500, saving cursor after each batch
            let skip = 0
            let hasMore = true
            let batchesProcessed = 0

            while (hasMore && consumersProcessed < MAX_CONTACTS_PER_TENANT) {
              const consumerFilter: Record<string, any> = { tenantIds: tenant._id }
              if (cursor) {
                consumerFilter.updatedAt = { $gt: new Date(cursor) }
              }

              const batch = await Consumer.find(consumerFilter)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(PAGE_SIZE)
                .lean()

              if (batch.length === 0) { hasMore = false; break }
              tenantHasData = true

              const candidates = batch.map((c) => {
                const name = safeDecrypt(c.name) || ''
                const phone = safeDecrypt(c.phone) || ''
                const email = safeDecrypt(c.email) || ''
                return transformConsumerToGoogle({ name, phone, email })
              })

              const { toCreate, skipped } = dedupContacts(candidates, dedupMap)
              let created = 0
              let errors = 0

              if (toCreate.length > 0) {
                const result = await batchCreateContacts(auth, toCreate)
                created = result.created
                errors = result.errors

                for (const c of toCreate) {
                  if (c.phone) dedupMap.phones.add(c.phone)
                  if (c.email) dedupMap.emails.add(c.email.toLowerCase().trim())
                }
              }

              consumersProcessed += batch.length
              totalCreated += created
              totalSkipped += skipped
              totalErrors += errors
              skip += PAGE_SIZE
              batchesProcessed++

              if (batch.length < PAGE_SIZE) { hasMore = false; break }

              // Save intra-tenant cursor after each batch
              // Uses batch[0].updatedAt (most recent in this page, sorted desc)
              await Tenant.updateOne(
                { _id: tenant._id },
                {
                  $set: {
                    'googleContacts.lastSyncAt': new Date(),
                    'googleContacts.lastSyncCursor': new Date(batch[0].updatedAt),
                  },
                }
              )

              // Small delay between batches to avoid hammering the DB
              await sleep(DELAY_BETWEEN_BATCHES_MS)
            }

            // No data for this tenant (and no cursor to resume from)
            if (!tenantHasData && !cursor) {
              tenantResults.push({
                tenantId: tenant._id.toString(),
                tenantName: tenant.name,
                created: 0,
                skipped: 0,
                total: 0,
                errors: 0,
                error: null,
              })
              continue
            }

            // Up-to-date (cursor exists but no new consumers)
            if (consumersProcessed === 0 && cursor) {
              await Tenant.updateOne(
                { _id: tenant._id },
                { $set: { 'googleContacts.lastSyncAt': new Date() } }
              )
              tenantResults.push({
                tenantId: tenant._id.toString(),
                tenantName: tenant.name,
                created: 0,
                skipped: 0,
                total: 0,
                errors: 0,
                error: null,
              })
              continue
            }

            // Final cursor save (if we exited the loop without hitting the per-batch save)
            if (batchesProcessed > 0) {
              // Already saved per-batch, but do a final save with runStart
              // to catch consumers updated DURING this run
              await Tenant.updateOne(
                { _id: tenant._id },
                {
                  $set: {
                    'googleContacts.lastSyncAt': new Date(),
                    'googleContacts.lastSyncCursor': runStart,
                  },
                }
              )
            }

            tenantResults.push({
              tenantId: tenant._id.toString(),
              tenantName: tenant.name,
              created: totalCreated,
              skipped: totalSkipped,
              total: consumersProcessed,
              errors: totalErrors,
              error: null,
            })
            totalTenantsSynced++
          } catch (err: any) {
            console.error(`[Cron][GC Sync] Error in tenant ${tenant.slug}:`, err)
            tenantResults.push({
              tenantId: tenant._id.toString(),
              tenantName: tenant.name,
              created: 0,
              skipped: 0,
              total: 0,
              errors: 0,
              error: String(err.message || err),
            })
          }
        }

        allResults.push({
          userId: user._id.toString(),
          userName: user.name,
          connectedEmail: user.googleContacts?.connectedEmail ?? null,
          tenants: tenantResults,
        })
      } catch (err: any) {
        console.error(`[Cron][GC Sync] Error processing user ${user._id}:`, err)
        allResults.push({
          userId: user._id.toString(),
          userName: user.name,
          connectedEmail: null,
          tenants: [],
        })
      }
    }

    // Determine if there are more users to process
    const hasMoreUsers = connectedUsers.length >= MAX_USERS_PER_RUN
    const lastUserId = connectedUsers[connectedUsers.length - 1]?._id?.toString()

    // Persist cursor to PlatformConfig for next run
    // If hasMore: save lastUserId so next run picks up from there
    // If !hasMore: clear cursor (full cycle complete, next run starts from beginning)
    await PlatformConfig.updateOne(
      { _id: 'platform' },
      {
        $set: {
          'gcSyncCursor.lastUserId': hasMoreUsers ? lastUserId : null,
          'gcSyncCursor.lastRunAt': new Date(),
        },
      }
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        usersProcessed: connectedUsers.length,
        tenantsSynced: totalTenantsSynced,
        hasMore: hasMoreUsers,
        nextUserId: hasMoreUsers ? lastUserId : null,
      },
      details: allResults,
    })
  } catch (error) {
    console.error('[Cron][GC Sync] General error:', error)
    return NextResponse.json(
      { error: 'Error executing cron job', details: String(error) },
      { status: 500 }
    )
  }
}
