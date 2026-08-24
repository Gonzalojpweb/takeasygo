import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 1) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Not Sunday or Monday', dayOfWeek })
    }

    const tenants = await Tenant.find({ 'commissionBalance.transfer': { $gt: 0 } }).lean()

    let created = 0
    let skipped = 0

    for (const tenant of tenants) {
      const existing = await SystemAnnouncement.findOne({
        title: `Recordatorio semanal de comisiones — ${tenant.name}`,
        status: 'published',
        expiresAt: { $gt: now },
      }).lean()

      if (existing) {
        skipped++
        continue
      }

      const balance = tenant.commissionBalance?.transfer || 0
      const balanceDisplay = (balance / 100).toFixed(2)

      await SystemAnnouncement.create({
        title: `Recordatorio semanal de comisiones — ${tenant.name}`,
        content: `<p>Hola <b>${tenant.name}</b>,</p>
<p>Tu saldo de comisiones pendientes por transferencia es de <b>$${balanceDisplay} USD</b>.</p>
<p>Por favor realiza el pago para evitar cargos automáticos.</p>
<p><a href="/${tenant.slug}/admin/commissions" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Ver mis comisiones</a></p>`,
        type: 'alert',
        status: 'published',
        publishedAt: now,
        targetPlans: [],
        targetTenantIds: [tenant._id],
        readBy: [],
        acceptances: [],
        requiresConsent: false,
        expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 días
      })

      created++
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      created,
      skipped,
      totalTenantsWithBalance: tenants.length,
    })
  } catch (error) {
    console.error('[Cron:commission-reminders] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
