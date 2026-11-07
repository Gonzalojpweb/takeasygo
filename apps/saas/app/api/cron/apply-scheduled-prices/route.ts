import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { runScheduledBatches } from '@/lib/menu/price-batches'

// GET /api/cron/apply-scheduled-prices — aplica los cambios de precios
// programados cuya hora ya llegó (cada 15 minutos). Bearer CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()
  const results = await runScheduledBatches()
  return NextResponse.json({ applied: results.filter(r => r.status === 'applied').length, results })
}
