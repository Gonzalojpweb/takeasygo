import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function POST(_request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const unlinkedMembers = await LoyaltyMember.find({
      $and: [
        { userId: { $eq: null } },
        { email: { $ne: '' } },
      ],
    }).select('email name phone').lean()

    let linked = 0
    let skipped = 0
    const results: { email: string; name: string; linked: boolean; reason?: string }[] = []

    for (const member of unlinkedMembers) {
      const email = (member.email ?? '').toLowerCase().trim()
      if (!email) {
        skipped++
        results.push({ email: '', name: member.name, linked: false, reason: 'Sin email' })
        continue
      }

      const user = await User.findOne({ email }).select('_id').lean()
      if (!user) {
        skipped++
        results.push({ email, name: member.name, linked: false, reason: 'User no encontrado' })
        continue
      }

      await LoyaltyMember.updateOne(
        { _id: member._id },
        { $set: { userId: user._id } }
      )
      linked++
      results.push({ email, name: member.name, linked: true })
    }

    return NextResponse.json({
      success: true,
      total: unlinkedMembers.length,
      linked,
      skipped,
      results: results.slice(0, 50),
    })
  } catch (error) {
    console.error('[superadmin/users/link-members]', error)
    return NextResponse.json({ error: 'Error al vincular miembros' }, { status: 500 })
  }
}
