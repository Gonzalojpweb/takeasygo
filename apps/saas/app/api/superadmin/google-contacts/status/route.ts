import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import User from '@/models/User'
import { connectDB } from '@/lib/mongoose'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  const dbUser = await User.findById(user.id)
    .select('googleContacts assignedTenants')
    .lean()

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const gc = (dbUser as any).googleContacts

  return NextResponse.json({
    isConnected: gc?.isConnected ?? false,
    connectedEmail: gc?.connectedEmail ?? null,
    authorizedAt: gc?.authorizedAt ?? null,
    lastSyncAt: null, // Tenant-level, shown per-tenant in sync results
  })
}
