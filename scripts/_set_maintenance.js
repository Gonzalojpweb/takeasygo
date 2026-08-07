#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/_set_maintenance.js --on      → activate maintenance mode
 *   node scripts/_set_maintenance.js --off     → deactivate maintenance mode
 *   node scripts/_set_maintenance.js --status  → check current state
 *
 * Requires MONGODB_URI env var.
 */
const { MongoClient } = require(require('path').join(__dirname, '..', 'node_modules', '.pnpm', 'node_modules', 'mongodb'))

const arg = process.argv[2]

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI env var is required')
    process.exit(1)
  }

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()

  if (arg === '--status') {
    const config = await db.collection('platformconfigs').findOne({ _id: 'platform' })
    console.log(`maintenanceMode: ${config?.maintenanceMode ?? false}`)
    await client.close()
    process.exit(0)
  }

  const value = arg === '--on' ? true : arg === '--off' ? false : null
  if (value === null) {
    console.error('Usage: --on | --off | --status')
    await client.close()
    process.exit(1)
  }

  await db.collection('platformconfigs').updateOne(
    { _id: 'platform' },
    { $set: { maintenanceMode: value } },
    { upsert: true }
  )
  console.log(`maintenanceMode set to ${value}`)
  await client.close()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
