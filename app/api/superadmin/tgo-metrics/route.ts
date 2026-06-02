import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { getTgoMetrics } from '@/lib/tgo-metrics'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const data = await getTgoMetrics(days)

    return NextResponse.json(data)
  } catch (error) {
    console.error('[GET /api/superadmin/tgo-metrics]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
