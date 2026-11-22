/**
 * Conciliación: comisión de TakeasyGO a PRECIO DE CARTA (21/11/2026)
 * ==================================================================
 * REGLA del dueño: la comisión va siempre sobre el precio de carta. Una promo
 * del comercio (p. ej. «Descuento %» −40 %) nunca la baja.
 *
 * Revisa los pedidos online desde `--since` y compara la comisión guardada
 * con la que corresponde a precio de carta (cada línea con descuento de carta
 * guarda su `menuDiscount.listBasePrice`).
 *
 *   npx tsx scripts/reconcile-commission-list.ts                      → informe (no toca nada)
 *   npx tsx scripts/reconcile-commission-list.ts --order=QUE-261121-3740
 *   npx tsx scripts/reconcile-commission-list.ts --tenant=que-cachapa
 *   npx tsx scripts/reconcile-commission-list.ts --apply              → corrige
 *
 * --apply corrige SOLO pedidos por transferencia/efectivo todavía NO pagados
 * a TakeasyGO: la diferencia entra sola en el saldo semanal (próximo pago).
 * Los ya pagados o cobrados por Mercado Pago (split) se listan aparte con el
 * monto a cobrar. Nunca baja una comisión.
 */
import mongoose from 'mongoose'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Con tsx el script corre como módulo ES (no hay __dirname): se busca el
// .env.local desde la carpeta donde se lo llama (apps/saas o la raíz).
function loadEnv() {
  const candidates = [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), 'apps/saas/.env.local')]
  for (const file of candidates) {
    let content: string
    try { content = readFileSync(file, 'utf-8') } catch { continue }
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
    return
  }
}
loadEnv()

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const APPLY = process.argv.includes('--apply')
const SINCE = new Date(`${arg('since') ?? '2026-11-20'}T00:00:00-03:00`)
const ORDER = arg('order')
const TENANT = arg('tenant')
const pesos = (c: number) => `$${(Math.round(c) / 100).toLocaleString('es-AR')}`

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('Falta MONGODB_URI')
  await mongoose.connect(uri)
  const { calculateFinalTotal } = await import('../lib/pricing')
  const { withLocationCommercialSettings } = await import('../lib/location-resolvers')
  const MANUAL = new Set(['transfer', 'cash'])
  const db = mongoose.connection.db!

  const tenantFilter: Record<string, unknown> = {}
  if (TENANT) {
    const t = await db.collection('tenants').findOne({ slug: TENANT })
    if (!t) throw new Error(`No existe el comercio ${TENANT}`)
    tenantFilter.tenantId = t._id
  }
  const query: Record<string, unknown> = ORDER
    ? { orderNumber: ORDER }
    : { ...tenantFilter, createdAt: { $gte: SINCE }, deletedAt: null, status: { $ne: 'cancelled' }, source: { $ne: 'pos' }, 'items.menuDiscount': { $ne: null } }
  const orders = await db.collection('orders').find(query).sort({ createdAt: 1 }).toArray()

  const platform = (await db.collection('platformconfigs').findOne({ _id: 'platform' as never })) ?? {}
  const settledIds = new Set<string>()
  for (const s of await db.collection('commissionsettlements').find({}, { projection: { orderIds: 1 } }).toArray()) {
    for (const id of s.orderIds ?? []) settledIds.add(String(id))
  }

  const tenants = new Map<string, any>()
  const locations = new Map<string, any>()
  let fixable = 0, fixableCents = 0
  const toCollect: string[] = []

  for (const o of orders) {
    const p = o.payment ?? {}
    const lines: any[] = o.items ?? []
    const menuGap = lines.reduce((s, l) => s + (l.menuDiscount ? Math.max(0, (l.menuDiscount.listBasePrice - l.basePrice) * l.quantity) : 0), 0)
    const delivery = Number(o.deliveryCost) || 0
    const charged = Math.max(0, (Number(p.baseTotal) || Number(o.total) || 0) - delivery)
    const storedList = Number(p.commissionListTotal) || 0
    const expectedList = Math.max(storedList, charged + menuGap)

    const tid = String(o.tenantId)
    if (!tenants.has(tid)) tenants.set(tid, await db.collection('tenants').findOne({ _id: o.tenantId }))
    const lid = String(o.locationId)
    if (!locations.has(lid)) locations.set(lid, await db.collection('locations').findOne({ _id: o.locationId }))
    const pricingTenant = withLocationCommercialSettings(tenants.get(tid) as never, locations.get(lid)?.settings)

    const method = String(p.method ?? '')
    const oldFee = Number(p.platformFeeAmount) || 0
    let newFee = oldFee
    if (MANUAL.has(method)) {
      newFee = calculateFinalTotal(Number(p.baseTotal) || 0, method as never, pricingTenant as never, platform as never, undefined, o.orderMode, delivery, Number(p.deliveryPlatformFeeAmount) || 0, expectedList).platformFeeAmount
    } else if (expectedList > storedList && oldFee > 0) {
      // Mercado Pago: mismo % que se usó, sobre lo que faltó.
      const base = (Number(o.total) || 0) + (Number(p.commissionListGapAmount) || 0)
      newFee = oldFee + Math.ceil((expectedList - storedList) * (base > 0 ? oldFee / base : 0))
    }
    const diff = newFee - oldFee
    const settled = settledIds.has(String(o._id))

    console.log(`\n${o.orderNumber} · ${o.createdAt.toISOString()} · ${method} · ${o.orderMode} · ${o.status}`)
    console.log(`  cobrado productos ${pesos(charged)} · envío ${pesos(delivery)} · recargo al cliente ${pesos(Number(p.surchargeAmount) || 0)}`)
    console.log(`  carta guardada ${pesos(storedList)} · carta según líneas ${pesos(charged + menuGap)} (promos ${pesos(menuGap)})`)
    console.log(`  comisión guardada ${pesos(oldFee)} · comisión a precio de carta ${pesos(newFee)}${settled ? ' · YA PAGADA a TakeasyGO' : ''}`)

    for (const l of lines) {
      const v = l.selectedVariant?.name ? ` (${l.selectedVariant.name})` : ''
      const d = l.menuDiscount
        ? ` · promo «${l.menuDiscount.title}» −${l.menuDiscount.percent}% sobre ${pesos(l.menuDiscount.listBasePrice)}`
        : ' · sin descuento de carta registrado'
      console.log(`    ${l.quantity}× ${l.name}${v}: base ${pesos(l.basePrice)} + extras ${pesos(l.extraPrice ?? 0)}${d}`)
    }
    if (diff <= 0) { console.log('  ✔ correcto'); continue }
    if (MANUAL.has(method) && !settled && p.status === 'approved') {
      fixable++
      fixableCents += diff
      console.log(`  ✖ falta ${pesos(diff)} → ${APPLY ? 'CORREGIDO (entra en el próximo pago)' : 'se corrige con --apply'}`)
      if (APPLY) {
        await db.collection('orders').updateOne({ _id: o._id, 'payment.platformFeeAmount': oldFee }, {
          $set: {
            'payment.platformFeeAmount': newFee,
            'payment.commissionListTotal': expectedList,
            'payment.commissionListGapAmount': Math.max(0, expectedList - charged),
            'payment.commissionReconciledAt': new Date(),
            'payment.commissionReconciledFrom': oldFee,
          },
        })
      }
    } else {
      toCollect.push(`${o.orderNumber}: ${pesos(diff)} (${MANUAL.has(method) ? (settled ? 'semana ya pagada' : `pago ${p.status}`) : 'Mercado Pago, ya se cobró por split'})`)
      console.log(`  ✖ falta ${pesos(diff)} → no se toca: cobrar aparte`)
    }
  }

  console.log(`\n── Resumen (${orders.length} pedidos) ──`)
  console.log(`Corregibles en el saldo semanal: ${fixable} pedidos, ${pesos(fixableCents)}${APPLY ? ' (aplicado)' : ' (correr con --apply)'}`)
  if (toCollect.length) console.log(`A cobrar aparte:\n  ${toCollect.join('\n  ')}`)
  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
