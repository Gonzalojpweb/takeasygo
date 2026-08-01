import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
import { getBadgesWithStatus } from '@/lib/impact'

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
  let phoneHash: string | null = null

  if (phone) {
    phoneHash = hashPhone(phone)
  } else if (userId) {
    const user = await User.findById(userId).select('phone email').lean() as any

    if (user?.phone) {
      phoneHash = hashPhone(user.phone)
    } else {
      // No phone → try LoyaltyMember by userId, then by email
      const member = await LoyaltyMember.findOne({
        tenantId: tenant._id,
        userId: userId,
      }).select('userImpact').lean() as any

      if (member) {
        return NextResponse.json({
          badges: (member.userImpact?.badges || []).map((b: any) => ({
            id: b.id,
            unlockedAt: b.unlockedAt,
          })),
        }, {
          headers: { 'Cache-Control': 'private, max-age=30' },
        })
      }

      if (user?.email) {
        const memberByEmail = await LoyaltyMember.findOne({
          tenantId: tenant._id,
          email: user.email.toLowerCase().trim(),
        }).select('userImpact').lean() as any

        if (memberByEmail) {
          return NextResponse.json({
            badges: (memberByEmail.userImpact?.badges || []).map((b: any) => ({
              id: b.id,
              unlockedAt: b.unlockedAt,
            })),
          }, {
            headers: { 'Cache-Control': 'private, max-age=30' },
          })
        }
      }
    }
  }

  // Standard path via phoneHash
  if (phoneHash) {
    const badges = await getBadgesWithStatus({
      tenantId: tenant._id,
      phoneHash,
    })

    return NextResponse.json({ badges }, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  }

  // No data found — return empty badges (not 404)
  return NextResponse.json({ badges: [] }, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  })
}
