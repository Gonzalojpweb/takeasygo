#!/usr/bin/env npx ts-node --esm
/**
 * Usage:
 *   npx ts-node --esm scripts/_set_maintenance.ts --on   → activate maintenance mode
 *   npx ts-node --esm scripts/_set_maintenance.ts --off  → deactivate maintenance mode
 *   npx ts-node --esm scripts/_set_maintenance.ts --status → check current state
 */
import { connectDB } from '../lib/mongoose'
import PlatformConfig from '../models/PlatformConfig'

const arg = process.argv[2]

async function main() {
  await connectDB()

  if (arg === '--status') {
    const config = await PlatformConfig.findById('platform').lean() as any
    console.log(`maintenanceMode: ${config?.maintenanceMode ?? false}`)
    process.exit(0)
  }

  const value = arg === '--on' ? true : arg === '--off' ? false : null
  if (value === null) {
    console.error('Usage: --on | --off | --status')
    process.exit(1)
  }

  await PlatformConfig.updateOne(
    { _id: 'platform' },
    { $set: { maintenanceMode: value } },
    { upsert: true }
  )
  console.log(`maintenanceMode set to ${value}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
