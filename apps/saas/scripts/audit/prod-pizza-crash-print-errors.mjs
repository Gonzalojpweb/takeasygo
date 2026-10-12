// Solo lectura en prod (--allow-prod): errores de impresión de pizza-crash (30d)
import mongoose from 'mongoose'
import { guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }
guardAgainstProd(uri, null)

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

const tenant = await db.collection('tenants').findOne({ slug: 'pizza-crash' })
if (!tenant) { console.error('tenant no encontrado'); process.exit(1) }

const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
const orders = await db.collection('orders').find({
  tenantId: tenant._id,
  'printLog.printedAt': { $gte: since },
}).project({ orderNumber: 1, printLog: 1, locationId: 1 }).toArray()

const locations = await db.collection('locations').find({ tenantId: tenant._id }).project({ name: 1 }).toArray()
const locName = new Map(locations.map(l => [String(l._id), l.name]))

const errores = []
for (const o of orders) {
  for (const entry of o.printLog ?? []) {
    if (entry.printedAt >= since && entry.success === false) {
      errores.push({
        sede: locName.get(String(o.locationId)) ?? String(o.locationId),
        orderNumber: o.orderNumber,
        printerName: entry.printerName,
        role: entry.role,
        error: (entry.error ?? '').slice(0, 200),
        printedAt: entry.printedAt?.toISOString?.(),
      })
    }
  }
}
errores.sort((a, b) => (b.printedAt ?? '').localeCompare(a.printedAt ?? ''))

const byError = {}
const byPrinter = {}
for (const e of errores) {
  const key = (e.error || '(sin mensaje)').slice(0, 120)
  byError[key] = (byError[key] ?? 0) + 1
  byPrinter[e.printerName ?? '?'] = (byPrinter[e.printerName ?? '?'] ?? 0) + 1
}

console.log(JSON.stringify({ totalErrores: errores.length, porMensaje: byError, porImpresora: byPrinter, ultimos: errores.slice(0, 15) }, null, 2))
await mongoose.disconnect()
