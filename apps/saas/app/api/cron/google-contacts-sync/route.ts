/**
 * Cron Job: Google Contacts sync automático
 *
 * Se ejecuta periódicamente para sincronizar contacts de tenants
 * cuyo superadmin tiene Google Contacts conectado.
 *
 * URL: /api/cron/google-contacts-sync
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import CustomerProfile from '@/models/CustomerProfile'
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

    for (const user of connectedUsers) {
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
          .select('_id name slug')
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

        for (const tenant of tenants) {
          try {
            const consumerFilter: Record<string, any> = { tenantIds: tenant._id }

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

            await Tenant.updateOne(
              { _id: tenant._id },
              { $set: { 'googleContacts.lastSyncAt': new Date() } }
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
