import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import { buildAuthUrlForUser } from '@/lib/google-contacts'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = buildAuthUrlForUser(user.id)
  return NextResponse.redirect(url)
}
