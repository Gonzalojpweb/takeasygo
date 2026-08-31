/**
 * Fix staging drift — asegura el índice {tenantId:1, locationId:1, isEnabled:1}
 * en la coleccion qrpromos (item A: QrPromo multi-sede).
 *
 * SAFETY: solo corre contra takeasygo-staging. Refusing fuera de ella.
 *
 * Ejecutar desde la raiz del repo:
 *   npx tsx --env-file=apps/saas/.env.staging apps/saas/scripts/fix-qr-promo-index.ts
 */

import mongoose from "mongoose"

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? ""
  if (!uri.includes("takeasygo-staging")) {
    console.error("ABORT: must target takeasygo-staging. Refusing to run.")
    process.exit(2)
  }
  console.log("DB:", uri.split("?")[0])

  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
  const col = mongoose.connection.db!.collection("qrpromos")

  const spec = { tenantId: 1, locationId: 1, isEnabled: 1 }
  const existing = await col.indexes()
  const match = existing.find((ix: any) => JSON.stringify(ix.key) === JSON.stringify(spec))

  if (match) {
    console.log("[ok] index ya existe:", match.name, "(unique=" + !!match.unique + ", sparse=" + !!match.sparse + "). nada que hacer.")
  } else {
    await col.createIndex(spec)
    console.log("[created] index {tenantId:1, locationId:1, isEnabled:1}")
  }

  const final = await col.indexes()
  console.table(final.map((ix: any) => ({ name: ix.name, key: JSON.stringify(ix.key), unique: !!ix.unique, sparse: !!ix.sparse })))

  await mongoose.disconnect()
  console.log("done.")
}

main().catch((err) => {
  console.error("fix-qr-promo-index error:", err)
  process.exit(1)
})
