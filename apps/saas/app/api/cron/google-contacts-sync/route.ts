/**
 * Cron Job: Google Contacts sync automático
 *
 * Se ejecuta periódicamente para sincronizar contactos de tenants
 * cuyo superadmin tiene Google Contacts conectado.
 *
 * Features:
 * - Incremental sync via lastSyncCursor (updatedAt filter per tenant)
 * - Rate limit: 1s delay between users, 500ms between tenants
 * - 429 retry handled in batchCreateContacts / listAllConnections (withRetry)
 * - 10k cap per tenant, cursor saved for next run
 *
 * URL: /api/cron/google-contacts-sync
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
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
const DELAY_BETWEEN_USERS_MS = 1_000
const DELAY_BETWEEN_TENANTS_MS = 500

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

    const connectedUsers = await User.find({
      'googleContacts.isConnected': true,
      'googleContacts.refreshToken': { $ne: null },
      role: 'superadmin',
      isActive: true,
    }).select('_id name email googleContacts assignedTenants').lean()

    if (connectedUsers.length === 0) {
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        summary: { usersProcessed: 0, tenantsSynced: 0 },
        details: [],
      })
    }

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
            // Incremental sync: use lastSyncCursor to filter by updatedAt
            const cursor = (tenant as any).googleContacts?.lastSyncCursor
            const consumerFilter: Record<string, any> = { tenantIds: tenant._id }
            if (cursor) {
              consumerFilter.updatedAt = { $gt: new Date(cursor) }
            }

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

            // If no consumers found and no cursor, this tenant has no data
            if (consumers.length === 0 && !cursor) {
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

            const candidates = consumers.map((c) => {
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

            // Save cursor: the most recent updatedAt from this batch
            const newCursor = consumers.length > 0
              ? consumers[0].updatedAt // Already sorted by updatedAt desc
              : new Date()

            await Tenant.updateOne(
              { _id: tenant._id },
              {
                $set: {
                  'googleContacts.lastSyncAt': new Date(),
                  'googleContacts.lastSyncCursor': new Date(newCursor),
                },
              }
            )

            tenantResults.push({
              tenantId: tenant._id.toString(),
              tenantName: tenant.name,
              created,
              skipped,
              total: consumers.length,
              errors,
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

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        usersProcessed: connectedUsers.length,
        tenantsSynced: totalTenantsSynced,
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
