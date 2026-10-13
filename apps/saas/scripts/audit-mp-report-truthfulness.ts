/**
 * Auditoría de verdad de reportes para tenants con MercadoPago ACTIVO y
 * AUTORIZADO (mpAccounts isActive + oauthIsConnected, o legacy equivalente).
 *
 * Detecta los problemas que inflan o deforman los números de los reportes
 * Excel/PDF y la conciliación de comisiones:
 *
 *  1. phantom_active_rejected — órdenes NO canceladas con pago rechazado/
 *     cancelado (ingreso fantasma: facturaban de más).
 *  2. stuck_awaiting — órdenes awaiting_payment viejas (webhook nunca llegó).
 *  3. manual_confirmed_pending_mp — órdenes confirmadas por el staff con pago
 *     MP todavía pending (nunca se cobraron: facturan de más).
 *  4. zero_fee_approved_mp — pagos MP/Kripton aprobados con
 *     platformFeeAmount = 0 (la comisión TakeasyGO nunca se registró:
 *     los reportes de comisiones quedan por debajo de la realidad).
 *  5. balance_inflation — órdenes canceladas que igual sumaron su comisión a
 *     tenant.commissionBalance.transfer (balance inflado).
 *
 * Por defecto SOLO LEE e imprime. Reparaciones explícitas:
 *  --fix-balance            descuenta del balance las comisiones de órdenes canceladas
 *  --cancel-stuck           cancela solo stuck_awaiting (>24h): huérfanas que nunca se
 *                           cobraron ni se entregaron (seguro)
 *  --cancel-unpaid-confirmed cancela manual_confirmed_pending_mp (>2h): órdenes que el
 *                           staff confirmó pero MP nunca cobró — REVISAR con el
 *                           restaurante antes (puede ser comida entregada sin cobro)
 *
 * Uso:
 *   MONGODB_URI=... npx tsx scripts/audit-mp-report-truthfulness.ts --allow-prod
 *   ... --fix-balance --allow-prod
 *   ... --cancel-stuck --allow-prod
 *   ... --cancel-unpaid-confirmed --allow-prod
 *   ... --days=90 --allow-prod        (limita el rango de las órdenes)
 *
 * La URI de producción es la base default `test` del cluster; sin --allow-prod
 * el guard de _safety corta la ejecución.
 */
import mongoose from 'mongoose'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Carga de env (MONGODB_URI o .env.local) ────────────────────────────────
function loadEnv() {
  if (process.env.MONGODB_URI) return
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* best-effort */ }
}

function guardAgainstProd(uri: string, argv: string[]): string {
  const noQuery = String(uri).split('?')[0]
  const afterScheme = noQuery.replace(/^[a-z0-9+.-]+:\/\//i, '')
  const slash = afterScheme.indexOf('/')
  const dbName = slash === -1 ? 'test' : afterScheme.slice(slash + 1).trim() || 'test'
  const override = argv.includes('--allow-prod') || process.env.AUDIT_ALLOW_PROD === '1'
  if (dbName === 'test' && !override) {
    console.error('')
    console.error('  ⛔ Este script apunta a PRODUCCIÓN (base default `test`).')
    console.error('     Agregá --allow-prod (o AUDIT_ALLOW_PROD=1) para ejecutar igual.')
    console.error('')
    process.exit(1)
  }
  return dbName
}

interface TenantDoc {
  _id: mongoose.Types.ObjectId
  slug: string
  mpAccounts?: { isActive?: boolean; oauthIsConnected?: boolean; oauthAuthorizedAt?: Date; label?: string }[]
  mercadopago?: { isConfigured?: boolean }
  mpOAuth?: { isConnected?: boolean; authorizedAt?: Date }
  commissionBalance?: { transfer?: number }
}

function isMpActiveAuthorized(t: TenantDoc): boolean {
  if (t.mpAccounts?.length) {
    return t.mpAccounts.some(a => a.isActive && a.oauthIsConnected)
  }
  return !!(t.mercadopago?.isConfigured && t.mpOAuth?.isConnected)
}

const money = (cents: number) => `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const nf = (n: number) => n.toLocaleString('es-AR')

async function run() {
  loadEnv()
  const argv = process.argv.slice(2)
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Falta MONGODB_URI (env o .env.local).')
    process.exit(1)
  }
  const dbName = guardAgainstProd(uri, argv)

  const fixBalance = argv.includes('--fix-balance')
  const cancelStuck = argv.includes('--cancel-stuck')
  const cancelUnpaidConfirmed = argv.includes('--cancel-unpaid-confirmed')
  const details = argv.includes('--details')
  const daysArg = argv.find(a => a.startsWith('--days='))
  const days = daysArg ? Number(daysArg.split('=')[1]) : null
  const since = days ? new Date(Date.now() - days * 86_400_000) : null

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
  const db = mongoose.connection.db!

  const tenants = (await db.collection('tenants')
    .find({ isActive: true })
    .project({ slug: 1, mpAccounts: 1, mercadopago: 1, mpOAuth: 1, commissionBalance: 1 })
    .toArray()) as unknown as TenantDoc[]

  const mpTenants = tenants.filter(isMpActiveAuthorized)

  console.log('')
  console.log('='.repeat(78))
  console.log(`AUDITORÍA DE VERDAD DE REPORTES — MP activo y autorizado  (base: ${dbName})`)
  console.log(`Tenants activos: ${tenants.length} | Con MP activo+autorizado: ${mpTenants.length}${since ? ` | Rango: últimos ${days} días` : ' | Rango: todo el historial'}`)
    console.log(`Modo: ${fixBalance || cancelStuck || cancelUnpaidConfirmed ? `REPARACIÓN (${[fixBalance && '--fix-balance', cancelStuck && '--cancel-stuck', cancelUnpaidConfirmed && '--cancel-unpaid-confirmed'].filter(Boolean).join(' + ')})` : 'SOLO LECTURA (dry-run)'}`)
  console.log('='.repeat(78))

  const timeFilter = since ? { createdAt: { $gte: since } } : {}

  let totalPhantom = 0, totalPhantomAmt = 0
  let totalStuck = 0, totalManualPending = 0
  let totalZeroFee = 0, totalZeroFeeAmt = 0
  let totalInflation = 0
  const findings: string[] = []

  for (const t of mpTenants) {
    const tid = t._id

    // 1. phantom: activas con pago rechazado/cancelado
    const phantom = await db.collection('orders').aggregate([
      { $match: { tenantId: tid, deletedAt: null, status: { $ne: 'cancelled' }, 'payment.status': { $in: ['rejected', 'cancelled'] }, ...timeFilter } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$total' } } },
    ]).toArray()

    // 2. stuck awaiting_payment > 24h
    const stuck = await db.collection('orders').aggregate([
      { $match: { tenantId: tid, deletedAt: null, status: 'awaiting_payment', createdAt: { $lt: new Date(Date.now() - 24 * 3600_000) }, ...timeFilter } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$total' } } },
    ]).toArray()

    // 3. confirmadas manualmente con pago MP still pending > 2h
    const manualPending = await db.collection('orders').aggregate([
      { $match: {
        tenantId: tid, deletedAt: null,
        status: { $nin: ['cancelled', 'awaiting_payment'] },
        'payment.method': 'mercadopago',
        'payment.status': 'pending',
        createdAt: { $lt: new Date(Date.now() - 2 * 3600_000) },
        ...timeFilter,
      } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$total' } } },
    ]).toArray()

    // 4. pagos aprobados sin comisión registrada
    const zeroFee = await db.collection('orders').aggregate([
      { $match: {
        tenantId: tid, deletedAt: null,
        status: { $ne: 'cancelled' },
        'payment.status': 'approved',
        'payment.method': { $in: ['mercadopago', 'kripton'] },
        'payment.platformFeeAmount': 0,
        ...timeFilter,
      } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$total' } } },
    ]).toArray()

    // 5. balance inflado por canceladas con commissionBalanceAdded
    const inflationAgg = await db.collection('orders').aggregate([
      { $match: { tenantId: tid, status: 'cancelled', 'payment.commissionBalanceAdded': true } },
      { $group: { _id: null, count: { $sum: 1 }, fee: { $sum: '$payment.platformFeeAmount' } } },
    ]).toArray()

    const pCount = phantom[0]?.count ?? 0, pAmt = phantom[0]?.amount ?? 0
    const sCount = stuck[0]?.count ?? 0
    const mCount = manualPending[0]?.count ?? 0, mAmt = manualPending[0]?.amount ?? 0
    const zCount = zeroFee[0]?.count ?? 0, zAmt = zeroFee[0]?.amount ?? 0
    const iCount = inflationAgg[0]?.count ?? 0, iFee = inflationAgg[0]?.fee ?? 0

    const hasAny = pCount || sCount || mCount || zCount || iCount
    if (!hasAny) continue

    totalPhantom += pCount; totalPhantomAmt += pAmt
    totalStuck += sCount
    totalManualPending += mCount
    totalZeroFee += zCount; totalZeroFeeAmt += zAmt
    totalInflation += iFee

    console.log(`\n── ${t.slug} ──────────────────────────────────────────────`)
    if (pCount) {
      console.log(`  ⚠ phantom (activas con pago rechazado): ${nf(pCount)} órdenes · ${money(pAmt)} de ingreso fantasma`)
      findings.push(`${t.slug}: ${pCount} órdenes activas con pago rechazado sumaban ${money(pAmt)} de más`)
    }
    if (sCount) {
      console.log(`  ⚠ stuck awaiting_payment (>24h): ${nf(sCount)} órdenes`)
      findings.push(`${t.slug}: ${sCount} órdenes atascadas en awaiting_payment`)
    }
    if (mCount) {
      console.log(`  ⚠ confirmadas con pago MP pending (>2h): ${nf(mCount)} órdenes · ${money(mAmt)}`)
      findings.push(`${t.slug}: ${mCount} órdenes confirmadas sin cobro MP (${money(mAmt)})`)
    }
    if (zCount) {
      console.log(`  ⚠ pagos MP/Kripton aprobados con comisión $0: ${nf(zCount)} órdenes · ${money(zAmt)} facturadas sin registrar comisión`)
      findings.push(`${t.slug}: ${zCount} pagos aprobados sin platformFeeAmount (${money(zAmt)} facturados)`)
    }
    if (iCount) {
      const balance = t.commissionBalance?.transfer ?? 0
      console.log(`  ⚠ balance inflado: ${nf(iCount)} canceladas con commissionBalanceAdded · fee acumulado ${money(iFee)} (balance actual ${money(balance)})`)
      findings.push(`${t.slug}: balance inflado en ${money(iFee)} por ${iCount} canceladas`)
    }

    // Detalle orden por orden (--details)
    if (details && (pCount || sCount || mCount || zCount)) {
      const detail = async (label: string, match: Record<string, unknown>) => {
        const rows = await db.collection('orders').find(match)
          .project({ orderNumber: 1, createdAt: 1, total: 1, status: 1, 'payment.status': 1, 'payment.method': 1, 'payment.platformFeeAmount': 1 })
          .sort({ createdAt: -1 })
          .limit(30)
          .toArray()
        for (const r of rows as any[]) {
          console.log(`      · ${label} #${r.orderNumber} · ${new Date(r.createdAt).toLocaleString('es-AR')} · ${money(r.total ?? 0)} · orden=${r.status} pago=${r.payment?.status}`)
        }
      }
      if (pCount) await detail('PHANTOM', { tenantId: tid, deletedAt: null, status: { $ne: 'cancelled' }, 'payment.status': { $in: ['rejected', 'cancelled'] }, ...timeFilter })
      if (sCount) await detail('STUCK', { tenantId: tid, deletedAt: null, status: 'awaiting_payment', createdAt: { $lt: new Date(Date.now() - 24 * 3600_000) }, ...timeFilter })
      if (mCount) await detail('SIN-COBRO', { tenantId: tid, deletedAt: null, status: { $nin: ['cancelled', 'awaiting_payment'] }, 'payment.method': 'mercadopago', 'payment.status': 'pending', createdAt: { $lt: new Date(Date.now() - 2 * 3600_000) }, ...timeFilter })
      if (zCount) await detail('SIN-FEE', { tenantId: tid, deletedAt: null, status: { $ne: 'cancelled' }, 'payment.status': 'approved', 'payment.method': { $in: ['mercadopago', 'kripton'] }, 'payment.platformFeeAmount': 0, ...timeFilter })
    }

    // ── Reparaciones ────────────────────────────────────────────────────
    if (fixBalance && iFee > 0) {
      const newBalance = Math.max(0, (t.commissionBalance?.transfer ?? 0) - iFee)
      await db.collection('tenants').updateOne({ _id: tid }, { $set: { 'commissionBalance.transfer': newBalance } })
      await db.collection('orders').updateMany(
        { tenantId: tid, status: 'cancelled', 'payment.commissionBalanceAdded': true },
        { $set: { 'payment.commissionBalanceAdded': false } }
      )
      console.log(`  ✅ balance corregido: ${money(t.commissionBalance?.transfer ?? 0)} → ${money(newBalance)}`)
    }

    if (cancelStuck && sCount) {
      const cancelledAt = new Date()
      const r1 = await db.collection('orders').updateMany(
        { tenantId: tid, deletedAt: null, status: 'awaiting_payment', createdAt: { $lt: new Date(Date.now() - 24 * 3600_000) } },
        { $set: { status: 'cancelled', 'payment.status': 'rejected', 'statusTimestamps.cancelledAt': cancelledAt } }
      )
      console.log(`  ✅ canceladas ${r1.modifiedCount} huérfanas stuck (>24h sin cobro)`)
    }

    if (cancelUnpaidConfirmed && mCount) {
      const cancelledAt = new Date()
      const r2 = await db.collection('orders').updateMany(
        { tenantId: tid, deletedAt: null, status: { $nin: ['cancelled', 'awaiting_payment'] }, 'payment.method': 'mercadopago', 'payment.status': 'pending', createdAt: { $lt: new Date(Date.now() - 2 * 3600_000) } },
        { $set: { status: 'cancelled', 'payment.status': 'rejected', 'statusTimestamps.cancelledAt': cancelledAt } }
      )
      console.log(`  ✅ canceladas ${r2.modifiedCount} confirmadas sin cobro MP (>2h)`)
    }
  }

  console.log('\n' + '='.repeat(78))
  console.log('RESUMEN')
  console.log('='.repeat(78))
  console.log(`  Ingreso fantasma (activas con pago rechazado): ${nf(totalPhantom)} órdenes · ${money(totalPhantomAmt)}`)
  console.log(`  Ordenes stuck awaiting_payment:               ${nf(totalStuck)}`)
  console.log(`  Confirmadas sin cobro MP:                     ${nf(totalManualPending)}`)
  console.log(`  Pagos aprobados sin comisión registrada:      ${nf(totalZeroFee)} · ${money(totalZeroFeeAmt)}`)
  console.log(`  Comisiones de canceladas inflando balances:   ${money(totalInflation)}`)
  if (findings.length === 0) {
    console.log('\n  ✅ Sin hallazgos: los tenants con MP activo+autorizado tienen datos consistentes.')
  } else {
    console.log(`\n  Hallazgos: ${findings.length}`)
    if (!fixBalance && !cancelStuck && !cancelUnpaidConfirmed) {
      console.log('  (dry-run — reejecutá con --fix-balance / --cancel-stuck / --cancel-unpaid-confirmed para reparar)')
    }
  }

  await mongoose.disconnect()
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
