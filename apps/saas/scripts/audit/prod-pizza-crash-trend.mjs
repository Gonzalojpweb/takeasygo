import mongoose from 'mongoose'
import { guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }
guardAgainstProd(uri, null)
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db
const tenant = await db.collection('tenants').findOne({ slug: 'pizza-crash' })

const rows = await db.collection('orders').aggregate([
  { $match: { tenantId: tenant._id, 'printLog.printerName': 'ST-POSJI2-ET' } },
  { $unwind: '$printLog' },
  { $match: { 'printLog.printerName': 'ST-POSJI2-ET' } },
  {
    $group: {
      _id: { mes: { $dateToString: { format: '%Y-%m', date: '$printLog.printedAt' } }, ok: '$printLog.success' },
      n: { $sum: 1 },
    },
  },
  { $sort: { '_id.mes': 1 } },
]).toArray()

// Última impresión exitosa de cualquier impresora en la sede
const lastOk = await db.collection('orders').find({
  tenantId: tenant._id,
  'printLog.success': true,
}).sort({ createdAt: -1 }).limit(1).project({ printLog: 1, createdAt: 1 }).toArray()

console.log(JSON.stringify({ porMes: rows, ultimaOrdenConExito: lastOk[0]?.createdAt }, null, 1))
await mongoose.disconnect()
