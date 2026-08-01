import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
import { getImpactSummary } from '@/lib/impact'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  const phone = req.nextUrl.searchParams.get('phone')
  const userId = req.nextUrl.searchParams.get('userId')

  if (!phone && !userId) {
    return NextResponse.json({ error: 'phone or userId requerido' }, { status: 400 })
  }

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // ── Cascading identity resolution ──────────────────────────────────────
  // Priority: phone → userId via phone → userId via LoyaltyMember.userId → email

  let phoneHash: string | null = null

  if (phone) {
    // Direct phone path
    phoneHash = hashPhone(phone)
  } else if (userId) {
    // Resolve from userId
    const user = await User.findById(userId).select('phone email').lean() as any

    if (user?.phone) {
      // User has phone → hash it
      phoneHash = hashPhone(user.phone)
    } else {
      // No phone on User → try LoyaltyMember lookup by userId, then by email
      const member = await LoyaltyMember.findOne({
        tenantId: tenant._id,
        userId: userId,
      }).select('userImpact cache.totalOrders phoneHash').lean() as any

      if (member) {
        // Found by userId on LoyaltyMember
        const impact = member.userImpact || {}
        return NextResponse.json({
          commercesSupported: impact.commercesSupported || 0,
          nearbyPurchases: impact.nearbyPurchases || 0,
          discoveredBusinesses: impact.discoveredBusinesses || 0,
          discoveredNeighborhoods: impact.discoveredNeighborhoods || [],
          badges: (impact.badges || []).map((b: any) => ({
            id: b.id,
            unlockedAt: b.unlockedAt,
          })),
          totalOrders: member.cache?.totalOrders || 0,
        }, {
          headers: { 'Cache-Control': 'private, max-age=30' },
        })
      }

      // Try by email (LoyaltyMember stores email as plain text)
      if (user?.email) {
        const memberByEmail = await LoyaltyMember.findOne({
          tenantId: tenant._id,
          email: user.email.toLowerCase().trim(),
        }).select('userImpact cache.totalOrders phoneHash').lean() as any

        if (memberByEmail) {
          const impact = memberByEmail.userImpact || {}
          return NextResponse.json({
            commercesSupported: impact.commercesSupported || 0,
            nearbyPurchases: impact.nearbyPurchases || 0,
            discoveredBusinesses: impact.discoveredBusinesses || 0,
            discoveredNeighborhoods: impact.discoveredNeighborhoods || [],
            badges: (impact.badges || []).map((b: any) => ({
              id: b.id,
              unlockedAt: b.unlockedAt,
            })),
            totalOrders: memberByEmail.cache?.totalOrders || 0,
          }, {
            headers: { 'Cache-Control': 'private, max-age=30' },
          })
        }
      }
    }
  }

  // If we have a phoneHash, use the standard path
  if (phoneHash) {
    const summary = await getImpactSummary({
      tenantId: tenant._id,
      phoneHash,
    })

    if (summary) {
      return NextResponse.json(summary, {
        headers: { 'Cache-Control': 'private, max-age=30' },
      })
    }
  }

  // No impact data found — return zeros (not 404)
  return NextResponse.json({
    commercesSupported: 0,
    nearbyPurchases: 0,
    discoveredBusinesses: 0,
    discoveredNeighborhoods: [],
    badges: [],
    totalOrders: 0,
  }, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  })
}
