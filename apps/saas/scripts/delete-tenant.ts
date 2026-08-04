/**
 * delete-tenant.ts — Borrado en cascada de un tenant completo.
 *
 * Uso:
 *   npx tsx scripts/delete-tenant.ts --slug <slug> [--dry-run] [--yes]
 *
 * Flags:
 *   --slug / --id    Identificador del tenant (requerido)
 *   --dry-run        Solo imprime counts, no borra nada (default)
 *   --yes            Salta la confirmación
 *
 * Requiere: MONGODB_URI en env o .env.local
 */
import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ── Load .env.local ──
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  console.error('❌ Falta MONGODB_URI en .env.local o en el entorno')
  process.exit(1)
}

// ── Cloudinary config ──
let cloudinary: any = null
async function loadCloudinary() {
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    const mod = await import('cloudinary')
    cloudinary = mod.v2
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
    return true
  }
  console.warn('⚠️  CLOUDINARY_* vars no configuradas — skip borrado de imágenes')
  return false
}

// ── Collections to clean ──
// Each entry: { collection, field, type }
// type: 'tenantId' = direct match, 'tenantSlug' = string match, 'array' = remove from array, 'nullable' = set null
interface CollectionDef {
  collection: string
  field: string
  type: 'tenantId' | 'tenantSlug' | 'array_tenants' | 'array_locations' | 'nullable'
  label: string
}

const COLLECTIONS: CollectionDef[] = [
  // Tier 1 — Leaf (direct tenantId)
  { collection: 'counters', field: 'tenantId', type: 'tenantId', label: 'Counters' },
  { collection: 'auditlogs', field: 'tenantId', type: 'tenantId', label: 'AuditLogs' },
  { collection: 'menuvisits', field: 'tenantId', type: 'tenantId', label: 'MenuVisits' },
  { collection: 'qrpromoviews', field: 'tenantId', type: 'tenantId', label: 'QrPromoViews' },
  { collection: 'shareevents', field: 'tenantId', type: 'tenantId', label: 'ShareEvents' },
  { collection: 'itemlikes', field: 'tenantId', type: 'tenantId', label: 'ItemLikes' },
  { collection: 'tiainsights', field: 'tenantId', type: 'tenantId', label: 'TiaInsights' },
  { collection: 'icosnapshots', field: 'tenantId', type: 'tenantId', label: 'ICOSnapshots' },
  { collection: 'precloseprintjobs', field: 'tenantId', type: 'tenantId', label: 'PreClosePrintJobs' },
  { collection: 'menuinsights', field: 'tenantId', type: 'tenantId', label: 'MenuInsights' },
  { collection: 'ratings', field: 'tenantId', type: 'tenantId', label: 'Ratings' },
  { collection: 'reservations', field: 'tenantId', type: 'tenantId', label: 'Reservations' },
  { collection: 'impactevents', field: 'tenantId', type: 'tenantId', label: 'ImpactEvents' },
  { collection: 'storeredemptions', field: 'tenantId', type: 'tenantId', label: 'StoreRedemptions' },
  { collection: 'feedbacks', field: 'tenantId', type: 'tenantId', label: 'Feedbacks' },
  { collection: 'customerevents', field: 'tenantId', type: 'tenantId', label: 'CustomerEvents' },
  { collection: 'customerprofiles', field: 'tenantId', type: 'tenantId', label: 'CustomerProfiles' },
  { collection: 'corporateaccounts', field: 'tenantId', type: 'tenantId', label: 'CorporateAccounts' },
  { collection: 'deliverypeople', field: 'tenantId', type: 'tenantId', label: 'DeliveryPeople' },
  { collection: 'deliverypushsubscriptions', field: 'tenantId', type: 'tenantId', label: 'DeliveryPushSubscriptions' },
  { collection: 'locationloyaltyconfigs', field: 'locationId', type: 'tenantId', label: 'LocationLoyaltyConfigs (via locationId → Location → tenantId)' },
  { collection: 'pushnotificationlogs', field: 'tenantId', type: 'tenantId', label: 'PushNotificationLogs' },
  { collection: 'exploreevents', field: 'tenantSlug', type: 'tenantSlug', label: 'ExploreEvents' },
  { collection: 'paymentnotifications', field: 'tenantId', type: 'tenantId', label: 'PaymentNotifications' },

  // Tier 2 — Mid-level
  { collection: 'pushsubscriptions', field: 'tenantId', type: 'tenantId', label: 'PushSubscriptions' },
  { collection: 'promotions', field: 'tenantId', type: 'tenantId', label: 'Promotions' },
  { collection: 'storeitems', field: 'tenantId', type: 'tenantId', label: 'StoreItems' },
  { collection: 'qrpromos', field: 'tenantId', type: 'tenantId', label: 'QrPromos' },

  // Tier 3 — Orders
  { collection: 'orders', field: 'tenantId', type: 'tenantId', label: 'Orders' },

  // Tier 4 — Infrastructure
  { collection: 'menus', field: 'tenantId', type: 'tenantId', label: 'Menus' },
  { collection: 'printers', field: 'tenantId', type: 'tenantId', label: 'Printers' },
  { collection: 'locations', field: 'tenantId', type: 'tenantId', label: 'Locations' },

  // Tier 5 — User/Consumer cleanup
  { collection: 'consumers', field: 'tenantIds', type: 'array_tenants', label: 'Consumers (remove from tenantIds[])' },
  { collection: 'users', field: 'tenantId', type: 'nullable', label: 'Users (nullify tenantId, remove from assignedTenants[])' },

  // Tier 6 — Soft-scope
  { collection: 'systemannouncements', field: 'targetTenantIds', type: 'array_tenants', label: 'SystemAnnouncements (remove from targetTenantIds[])' },
  { collection: 'restaurantdirectories', field: 'convertedToTenantId', type: 'nullable', label: 'RestaurantDirectories (nullify)' },
]

// ── Args ──
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}
const hasFlag = (name: string) => args.includes(`--${name}`)

const slug = getArg('slug')
const id = getArg('id')
const DRY_RUN = hasFlag('dry-run')
const YES = hasFlag('yes')

if (!slug && !id) {
  console.error('Uso: npx tsx scripts/delete-tenant.ts --slug <slug> [--dry-run] [--yes]')
  process.exit(1)
}

// ── Alert states (orders with real activity) ──
const ALERT_STATUSES = ['confirmed', 'preparing', 'ready', 'en_ruta', 'arrived', 'delivered']

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  DELETE TENANT — ${DRY_RUN ? '🔍 DRY RUN' : '🔥 REAL DELETE'}`)
  console.log(`${'='.repeat(60)}\n`)

  await mongoose.connect(MONGODB_URI!)
  console.log('✅ Conectado a MongoDB\n')

  const db = mongoose.connection.db!

  // ── Find tenant ──
  const tenantQuery = slug ? { slug } : { _id: new mongoose.Types.ObjectId(id!) }
  const tenant = await db.collection('tenants').findOne(tenantQuery)
  if (!tenant) {
    console.error(`❌ Tenant no encontrado: ${slug || id}`)
    await mongoose.disconnect()
    process.exit(1)
  }

  const tenantId = tenant._id
  const tenantSlug = tenant.slug
  const tenantName = tenant.name

  console.log(`Tenant:    ${tenantName}`)
  console.log(`Slug:      ${tenantSlug}`)
  console.log(`ID:        ${tenantId}`)
  console.log(`Locations: ${await db.collection('locations').countDocuments({ tenantId })}\n`)

  // ── Collect counts ──
  let totalDocs = 0
  let alertDocs = 0
  const counts: { label: string; count: number; alert?: string }[] = []
  const locationIds: mongoose.Types.ObjectId[] = []

  // Get all locationIds for this tenant first (needed for LocationLoyaltyConfig)
  const locations = await db.collection('locations').find({ tenantId }).project({ _id: 1 }).toArray()
  for (const loc of locations) locationIds.push(loc._id)

  for (const col of COLLECTIONS) {
    let query: any = {}
    let count = 0

    if (col.type === 'tenantId') {
      if (col.collection === 'locationloyaltyconfigs') {
        // LocationLoyaltyConfig references locationId, not tenantId directly
        if (locationIds.length > 0) {
          count = await db.collection(col.collection).countDocuments({ locationId: { $in: locationIds } })
        }
      } else {
        count = await db.collection(col.collection).countDocuments({ tenantId })
      }
    } else if (col.type === 'tenantSlug') {
      count = await db.collection(col.collection).countDocuments({ tenantSlug })
    } else if (col.type === 'array_tenants') {
      if (col.collection === 'consumers') {
        count = await db.collection(col.collection).countDocuments({ tenantIds: tenantId })
      } else if (col.collection === 'systemannouncements') {
        count = await db.collection(col.collection).countDocuments({ targetTenantIds: tenantId })
      }
    } else if (col.type === 'nullable') {
      if (col.collection === 'users') {
        count = await db.collection(col.collection).countDocuments({
          $or: [{ tenantId }, { assignedTenants: tenantId }]
        })
      } else if (col.collection === 'restaurantdirectories') {
        count = await db.collection(col.collection).countDocuments({ convertedToTenantId: tenantId })
      }
    }

    // ── Special: check orders for real activity ──
    let alertMsg: string | undefined
    if (col.collection === 'orders' && count > 0) {
      const activeOrders = await db.collection('orders').countDocuments({
        tenantId,
        status: { $in: ALERT_STATUSES }
      })
      const paidOrders = await db.collection('orders').countDocuments({
        tenantId,
        'payment.status': 'approved'
      })
      if (activeOrders > 0) {
        alertMsg = `⚠️  ${activeOrders} orders with ACTIVE status (${ALERT_STATUSES.join('|')})`
        alertDocs += activeOrders
      }
      if (paidOrders > 0) {
        alertMsg = (alertMsg ? alertMsg + ' + ' : '') + `⚠️  ${paidOrders} orders with APPROVED payment`
        alertDocs += paidOrders
      }
    }

    // ── Special: check consumers with real orders ──
    if (col.collection === 'consumers' && count > 0) {
      const activeConsumers = await db.collection('consumers').countDocuments({
        tenantIds: tenantId,
        totalOrders: { $gt: 0 }
      })
      if (activeConsumers > 0) {
        alertMsg = (alertMsg ? alertMsg + ' + ' : '') + `⚠️  ${activeConsumers} consumers with totalOrders > 0`
        alertDocs += activeConsumers
      }
    }

    // ── Special: check ratings ──
    if (col.collection === 'ratings' && count > 0) {
      const rated = await db.collection('ratings').countDocuments({
        tenantId,
        rating: { $exists: true, $ne: null }
      })
      if (rated > 0) {
        alertMsg = (alertMsg ? alertMsg + ' + ' : '') + `⚠️  ${rated} ratings with actual rating value`
        alertDocs += rated
      }
    }

    totalDocs += count
    counts.push({ label: col.label, count, alert: alertMsg })
  }

  // ── Cloudinary assets ──
  let cloudinaryFiles = 0
  const hasCloudinary = await loadCloudinary()
  if (hasCloudinary && cloudinary) {
    try {
      const result = await cloudinary.search.expression(`folder:takeasygo/${tenantSlug}`).execute()
      cloudinaryFiles = result.total_count || 0
    } catch { /* folder might not exist */ }
    try {
      const result2 = await cloudinary.search.expression(`folder:takeasygo/shares/${tenantSlug}`).execute()
      cloudinaryFiles += result2.total_count || 0
    } catch { /* folder might not exist */ }
  }

  // ── Print report ──
  console.log('─'.repeat(60))
  console.log('COLECCIONES A BORRAR:')
  console.log('─'.repeat(60))

  for (const c of counts) {
    if (c.count > 0) {
      console.log(`  ${c.label}: ${c.count}`)
      if (c.alert) console.log(`    ${c.alert}`)
    }
  }

  console.log('─'.repeat(60))
  console.log(`  TOTAL documentos: ${totalDocs}`)
  if (cloudinaryFiles > 0) console.log(`  Cloudinary files: ${cloudinaryFiles}`)
  if (alertDocs > 0) {
    console.log(`\n  🚨 ALERTAS: ${alertDocs} documentos con actividad real detectada`)
    console.log('  → Revisá estos antes de borrar')
  }
  console.log('─'.repeat(60))

  // ── Check for alerts ──
  if (alertDocs > 0 && !YES) {
    console.error('\n❌ ABORTADO: Se detectó actividad real. Revisá las alertas arriba.')
    await mongoose.disconnect()
    process.exit(2)
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN completado — no se borró nada.')
    await mongoose.disconnect()
    return
  }

  // ── Confirm ──
  if (!YES) {
    const readline = await import('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise<string>(resolve =>
      rl.question(`\n⚠️  ¿Borrar ${totalDocs} documentos + ${cloudinaryFiles} archivos Cloudinary? (yes/no): `, resolve)
    )
    rl.close()
    if (answer.toLowerCase() !== 'yes') {
      console.log('Cancelado.')
      await mongoose.disconnect()
      return
    }
  }

  // ── DELETE ──
  console.log('\n🔥 Iniciando borrado...\n')

  // 1. Cloudinary
  if (hasCloudinary && cloudinary && cloudinaryFiles > 0) {
    console.log('  → Borrando Cloudinary assets...')
    try { await cloudinary.api.delete_resources_by_prefix(`takeasygo/${tenantSlug}/`) } catch {}
    try { await cloudinary.api.delete_resources_by_prefix(`takeasygo/shares/${tenantSlug}/`) } catch {}
    try { await cloudinary.api.delete_folder(`takeasygo/${tenantSlug}`) } catch {}
    try { await cloudinary.api.delete_folder(`takeasygo/shares/${tenantSlug}`) } catch {}
    console.log('  ✅ Cloudinary assets borrados')
  }

  // 2. Cascade delete collections
  for (const col of COLLECTIONS) {
    let result: any = { deletedCount: 0 }

    if (col.type === 'tenantId') {
      if (col.collection === 'locationloyaltyconfigs') {
        if (locationIds.length > 0) {
          result = await db.collection(col.collection).deleteMany({ locationId: { $in: locationIds } })
        }
      } else {
        result = await db.collection(col.collection).deleteMany({ tenantId })
      }
    } else if (col.type === 'tenantSlug') {
      result = await db.collection(col.collection).deleteMany({ tenantSlug })
    } else if (col.type === 'array_tenants') {
      if (col.collection === 'consumers') {
        result = await db.collection(col.collection).updateMany(
          { tenantIds: tenantId },
          { $pull: { tenantIds: tenantId } } as any
        )
      } else if (col.collection === 'systemannouncements') {
        result = await db.collection(col.collection).updateMany(
          { targetTenantIds: tenantId },
          { $pull: { targetTenantIds: tenantId } } as any
        )
      }
    } else if (col.type === 'nullable') {
      if (col.collection === 'users') {
        result = await db.collection(col.collection).updateMany(
          { $or: [{ tenantId }, { assignedTenants: tenantId }] },
          { $set: { tenantId: null }, $pull: { assignedTenants: tenantId } } as any
        )
      } else if (col.collection === 'restaurantdirectories') {
        result = await db.collection(col.collection).updateMany(
          { convertedToTenantId: tenantId },
          { $set: { convertedToTenantId: null } }
        )
      }
    }

    const affected = result.deletedCount ?? result.modifiedCount ?? 0
    if (affected > 0) console.log(`  ✅ ${col.label}: ${affected}`)
  }

  // 3. Delete tenant
  await db.collection('tenants').deleteOne({ _id: tenantId })
  console.log(`  ✅ Tenant "${tenantName}" borrado`)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ✅ BORRADO COMPLETADO: ${tenantName} (${tenantSlug})`)
  console.log(`${'='.repeat(60)}\n`)

  await mongoose.disconnect()
}

main().catch(e => {
  console.error('❌ Error:', e.message)
  process.exit(1)
})
