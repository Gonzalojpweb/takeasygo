import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import { buildAuthUrl } from '@/lib/google-contacts'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = buildAuthUrl(user.tenantId)
  return NextResponse.redirect(url)
}
