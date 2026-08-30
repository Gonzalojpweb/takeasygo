/**
 * Fix staging drift — `sync_orders.tenantId_1_externalOrderId_1` is UNIQUE NON-SPARSE
 * in the takeasygo-staging collection, but the schema declares it sparse.
 * With the multi-sede POS, orders created without an externalOrderId (POS-initiated)
 * store null and the 2nd such order for the same tenant would hit E11000 → 500.
 *
 * This drops the drifted index and recreates it as { unique: true, sparse: true }.
 * SAFETY: refuses to run outside takeasygo-staging.
 *
 * Run from repo root:
 *   npx tsx --env-file=apps/sync/.env.staging apps/sync/scripts/e-validate/fix-staging-indexes.ts
 */

import mongoose from "mongoose"

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? ""
  if (!uri.includes("takeasygo-staging")) {
    console.error("ABORT: must target takeasygo-staging. Refusing to run.")
    process.exit(2)
  }

  await mongoose.connect(uri)
  const col = mongoose.connection.db.collection("sync_orders")

  const indexes = await col.indexes()
  const drifted = indexes.find((ix: any) =>
    Object.keys(ix.key).join(",") === "tenantId,externalOrderId" && ix.unique && !ix.sparse
  )

  if (!drifted) {
    console.log("No drifted non-sparse unique index found. Indexes:")
    console.table(indexes.map((ix: any) => ({ name: ix.name, key: JSON.stringify(ix.key), unique: !!ix.unique, sparse: !!ix.sparse })))
    await mongoose.disconnect()
    return
  }

  console.log("[stage 1] dropping drifted index:", drifted.name)
  await col.dropIndex(drifted.name)

  console.log("[stage 2] creating sparse unique {tenantId:1, externalOrderId:1}")
  await col.createIndex({ tenantId: 1, externalOrderId: 1 }, { unique: true, sparse: true, name: "tenantId_1_externalOrderId_1" })

  const after = await col.indexes()
  console.log("[stage 3] final indexes:")
  console.table(after.map((ix: any) => ({ name: ix.name, key: JSON.stringify(ix.key), unique: !!ix.unique, sparse: !!ix.sparse })))

  await mongoose.disconnect()
  console.log("done.")
}

main().catch((err) => {
  console.error("fix-index error:", err)
  process.exit(1)
})