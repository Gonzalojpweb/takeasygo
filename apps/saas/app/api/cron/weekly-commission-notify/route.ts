import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Cron de notificación semanal de comisiones.
 * Corre los martes a las 08:00 UTC (05:00 ART).
 *
 * Para cada tenant activo:
 * 1. Busca el statement de la semana anterior
 * 2. Si NO existe pero SÍ hubo órdenes transfer → cierre falló → log error
 * 3. Si existe con status pendiente/vencido → crea SystemAnnouncement
 * 4. Si no hubo órdenes → skip silencioso (caso normal)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const now = new Date()

    // Calcular semana anterior (lunes a domingo)
    const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const thisMonday = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
      0, 0, 0, 0
    ))
    const lastWeekStart = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000)
    const lastWeekEnd = new Date(thisMonday.getTime() - 1000)

    // Solo ejecutar martes (dayOfWeek === 2)
    if (dayOfWeek !== 2) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Not Tuesday', dayOfWeek })
    }

    const tenants = await Tenant.find({ isActive: true })
      .select('slug name')
      .lean()

    let notified = 0
    let skipped = 0
    let failedClose = 0

    for (const tenant of tenants) {
      // Buscar statement de la semana anterior
      const statement = await WeeklyCommissionStatement.findOne({
        tenantId: tenant._id,
        weekStart: lastWeekStart,
      }).lean()

      if (!statement) {
        // No hay statement: ¿hubo órdenes transfer la semana pasada?
        const transferOrders = await Order.countDocuments({
          tenantId: tenant._id,
          'payment.method': 'transfer',
          'payment.status': { $ne: 'cancelled' },
          'statusTimestamps.confirmedAt': { $gte: lastWeekStart, $lte: lastWeekEnd },
        })

        if (transferOrders > 0) {
          // El cierre falló — log explícito
          console.error(
            `[Cron:weekly-commission-notify] ALERTA: Tenant ${tenant.name} (${tenant._id}) ` +
            `tuvo ${transferOrders} órdenes transfer confirmadas la semana pasada ` +
            `(${lastWeekStart.toISOString()} — ${lastWeekEnd.toISOString()}), ` +
            `pero NO existe WeeklyCommissionStatement. El cierre del lunes falló.`
          )
          failedClose++
        }
        // Si no hubo órdenes, skip silencioso (caso normal)
        skipped++
        continue
      }

      // Si el statement ya está pagado, no notificar
      if (statement.status === 'pagado') {
        skipped++
        continue
      }

      // Calcular monto vencido de semanas anteriores
      const vencidos = await WeeklyCommissionStatement.aggregate([
        {
          $match: {
            tenantId: tenant._id,
            weekStart: { $lt: lastWeekStart },
            status: { $in: ['pendiente', 'vencido'] },
          },
        },
        {
          $group: {
            _id: null,
            totalVencido: { $sum: '$amount' },
            countVencido: { $sum: 1 },
          },
        },
      ])

      const totalVencido = vencidos[0]?.totalVencido || 0
      const countVencido = vencidos[0]?.countVencido || 0
      const totalDeuda = statement.amount + totalVencido

      // Formatear montos para el display (centavos → pesos)
      const semanaMonto = (statement.amount / 100).toFixed(2)
      const vencidoMonto = (totalVencido / 100).toFixed(2)
      const totalMonto = (totalDeuda / 100).toFixed(2)

      // Fechas para display
      const fmt = (d: Date) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
      const semanaLabel = `${fmt(statement.weekStart)} — ${fmt(statement.weekEnd)}`

      // Construir contenido HTML
      let content = `<p>Hola <b>${tenant.name}</b>,</p>`
      content += `<p>Tu comisión semanal por transferencias (${semanaLabel}) es de <b>$${semanaMonto}</b>.</p>`

      if (countVencido > 0) {
        content += `<p style="color:#dc2626;">⚠ Tenés <b>${countVencido} semana(s) anterior(es) vencida(s)</b> por <b>$${vencidoMonto}</b>.</p>`
        content += `<p><b>Total a pagar: $${totalMonto}</b></p>`
      }

      content += `<p>Por favor realiza el pago para evitar que se acumule.</p>`
      content += `<p><a href="/${tenant.slug}/admin/commissions" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Ver mis comisiones</a></p>`

      // Anti-duplicado: verificar si ya existe un anuncio reciente para este tenant
      const existingAnnouncement = await SystemAnnouncement.findOne({
        title: `Comisiones pendientes — ${tenant.name}`,
        status: 'published',
        expiresAt: { $gt: now },
      }).lean()

      if (existingAnnouncement) {
        skipped++
        continue
      }

      await SystemAnnouncement.create({
        title: `Comisiones pendientes — ${tenant.name}`,
        content,
        type: 'alert',
        status: 'published',
        publishedAt: now,
        targetPlans: [],
        targetTenantIds: [tenant._id],
        readBy: [],
        acceptances: [],
        requiresConsent: false,
        expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      })

      notified++
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      lastWeekStart: lastWeekStart.toISOString(),
      lastWeekEnd: lastWeekEnd.toISOString(),
      notified,
      skipped,
      failedClose,
      totalTenants: tenants.length,
    })
  } catch (error) {
    console.error('[Cron:weekly-commission-notify] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
