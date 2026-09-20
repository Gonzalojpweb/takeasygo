import mongoose from 'mongoose'
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import crypto from 'crypto'

// ── Config ───────────────────────────────────────────────────────────────────
const ENV_FILE = process.argv.includes('--production')
  ? '../.env.production'
  : '../.env.staging'

config({ path: resolve(__dirname, ENV_FILE) })

const MONGODB_URI = process.env.MONGODB_URI!
const DRY_RUN = process.argv.includes('--dry-run')
const TENANT_SLUG = 'que-cachapa'
const CSV_PATH = resolve(__dirname, '../../../clientes_carga.csv')
const BATCH_SIZE = 100

// ── Helpers ──────────────────────────────────────────────────────────────────
function hashPhone(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.length >= 10 ? digits.slice(-10) : digits
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function hashEmail(email: string): string {
  if (!email) return ''
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

function parseCSV(text: string) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    rows.push(row)
  }
  return rows
}

function mapSegmentToTier(segment: string): string {
  const s = (segment || '').trim().toLowerCase()
  if (s === 'vip') return 'gold'
  if (s === 'habitual') return 'silver'
  if (s === 'ocasional' || s === 'recuperado') return 'bronze'
  return 'none'
}

function generatePublicId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `TGO-${seg()}-${seg()}-${seg()}`
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔄 Import Club "${TENANT_SLUG}" — ${DRY_RUN ? 'DRY RUN' : 'EJECUCIÓN REAL'}\n`)

  // 1. Connect
  console.log('📡 Conectando a MongoDB...')
  await mongoose.connect(MONGODB_URI)
  const db = mongoose.connection.db!
  console.log('✅ Conectado\n')

  // 2. Find tenant
  const tenant = await db.collection('tenants').findOne(
    { slug: TENANT_SLUG },
    { projection: { _id: 1, slug: 1, loyalty: 1 } }
  )
  if (!tenant) {
    console.error(`❌ Tenant "${TENANT_SLUG}" no encontrado`)
    await mongoose.disconnect()
    process.exit(1)
  }
  console.log(`✅ Tenant: ${tenant.slug} (${tenant._id})`)

  // 3. Find locations
  const locations = await db.collection('locations').find(
    { tenantId: tenant._id },
    { projection: { _id: 1, name: 1 } }
  ).toArray()

  const locationMap = new Map<string, mongoose.Types.ObjectId>()
  for (const loc of locations) {
    locationMap.set(loc.name.toLowerCase().trim(), loc._id)
  }
  console.log(`📍 Locations: ${locations.map((l: any) => l.name).join(', ') || '(ninguna)'}`)

  // 4. Parse CSV
  console.log(`📄 Leyendo CSV: ${CSV_PATH}`)
  const csvText = readFileSync(CSV_PATH, 'utf-8')
  const rows = parseCSV(csvText)
  console.log(`📊 Total filas: ${rows.length}\n`)

  // 5. Load existing phoneHashes for dedup
  const existingMembers = await db.collection('loyaltymembers').find(
    { tenantId: tenant._id },
    { projection: { phoneHash: 1 } }
  ).toArray()
  const existingHashes = new Set(existingMembers.map((m: any) => m.phoneHash))
  console.log(`🔍 Miembros existentes: ${existingMembers.length}`)

  // 6. Process rows
  let imported = 0
  let skipped = 0
  let errors = 0
  const skippedNames: string[] = []
  const errorDetails: string[] = []

  // Batch arrays for bulk insert
  const userBatch: any[] = []
  const memberBatch: any[] = []

  for (const row of rows) {
    const nombre = (row['nombre'] || '').trim()
    const apellido = (row['apellido'] || '').trim()
    const fullName = `${nombre} ${apellido}`.trim()

    if (!fullName) {
      skipped++
      skippedNames.push('(sin nombre)')
      continue
    }

    const phone = (row['telefono'] || '').trim()
    const email = (row['email'] || '').trim().toLowerCase()
    const pHash = hashPhone(phone)

    if (!pHash) {
      skipped++
      skippedNames.push(`${fullName} (sin teléfono)`)
      continue
    }

    if (existingHashes.has(pHash)) {
      skipped++
      skippedNames.push(`${fullName} (${phone}) — ya existe`)
      continue
    }

    // Resolve locationId
    const sucursal = (row['sucursal_registro'] || '').trim()
    let locationId: mongoose.Types.ObjectId | null = null
    if (sucursal) {
      const locId = locationMap.get(sucursal.toLowerCase().trim())
      if (locId) {
        locationId = locId
      }
    }

    // Parse fields
    const birthDateStr = (row['fecha_nacimiento'] || '').trim()
    const birthDate = birthDateStr ? new Date(birthDateStr) : null

    const puntosDisponibles = parseInt(row['puntos_disponibles'] || '0', 10) || 0
    const totalSumas = parseInt(row['total_sumas'] || '0', 10) || 0
    const totalCanjes = parseInt(row['total_canjes'] || '0', 10) || 0

    const ultimoMovStr = (row['ultimo_movimiento'] || '').trim()
    const ultimoMovimiento = ultimoMovStr ? new Date(ultimoMovStr) : null

    const fechaRegistroStr = (row['fecha_registro'] || '').trim()
    const fechaRegistro = fechaRegistroStr ? new Date(fechaRegistroStr) : new Date()

    const segmento = (row['segmento_lealtad'] || '').trim()
    const referidoPor = (row['referido_por'] || '').trim()
    const documento = (row['documento'] || '').trim()

    const tier = mapSegmentToTier(segmento)

    // 6a. Create User (upsert by email or phone)
    let userId: mongoose.Types.ObjectId | null = null

    if (!DRY_RUN) {
      const existingUser = await db.collection('users').findOne({
        $or: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ]
      })

      if (existingUser) {
        userId = existingUser._id
        // Update phone if missing
        if (phone && !existingUser.phone) {
          await db.collection('users').updateOne(
            { _id: userId },
            { $set: { phone } }
          )
        }
      } else {
        const newUser = {
          name: fullName,
          email: email || `${pHash.slice(0, 12)}@placeholder.local`,
          phone: phone || null,
          role: 'consumer',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const userResult = await db.collection('users').insertOne(newUser)
        userId = userResult.insertedId
      }
    }

    // 6b. Build LoyaltyMember
    const member: any = {
      tenantId: tenant._id,
      name: fullName,
      phone,
      email,
      birthDate,
      phoneHash: pHash,
      status: 'active',
      joinedAt: fechaRegistro,
      source: 'manual_import',
      cache: {
        totalOrders: totalSumas,
        totalSpent: 0,
        lastOrderAt: ultimoMovimiento,
        updatedAt: new Date(),
      },
      loyalty: {
        points: puntosDisponibles,
        tier,
      },
      sosConfig: {
        maxSosAllowed: 100,
        hasPendingSos: false,
        sosUsed: 0,
      },
      store: {
        totalRedemptions: totalCanjes,
        totalPointsSpent: 0,
        lastRedemptionAt: null,
      },
      wallet: {
        publicId: generatePublicId(),
      },
      notes: [
        documento ? `DNI: ${documento}` : '',
        referidoPor ? `Referido por: ${referidoPor}` : '',
      ].filter(Boolean).join(' | '),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    if (locationId) {
      member.locationId = locationId
    }
    if (userId) {
      member.userId = userId
    }

    memberBatch.push(member)
    existingHashes.add(pHash)
    imported++

    // Report progress
    if (imported % 100 === 0) {
      console.log(`  📝 Procesados: ${imported} importados, ${skipped} skipeados`)
    }
  }

  // 7. Bulk insert
  if (!DRY_RUN && memberBatch.length > 0) {
    console.log(`\n💾 Insertando ${memberBatch.length} miembros...`)

    // Insert in batches
    for (let i = 0; i < memberBatch.length; i += BATCH_SIZE) {
      const batch = memberBatch.slice(i, i + BATCH_SIZE)
      try {
        await db.collection('loyaltymembers').insertMany(batch, { ordered: false })
        console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} insertados`)
      } catch (err: any) {
        // ordered:false means partial inserts are OK
        const inserted = err.result?.nInserted ?? 0
        console.log(`  ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted}/${batch.length} insertados (${err.writeErrors?.length ?? 0} errores)`)
        errors += (err.writeErrors?.length ?? 0)
      }
    }

    // Now create/update Consumers for all imported members
    console.log('\n👤 Sincronizando Consumers...')
    const allPhoneHashes = memberBatch.map(m => m.phoneHash)
    for (let i = 0; i < allPhoneHashes.length; i += BATCH_SIZE) {
      const batch = allPhoneHashes.slice(i, i + BATCH_SIZE)
      for (const pHash of batch) {
        const member = memberBatch.find(m => m.phoneHash === pHash)
        if (!member) continue

        const eHash = hashEmail(member.email)
        const consumerUpdate: any = {
          $setOnInsert: {
            phoneHash: pHash,
            emailHash: eHash,
            name: member.name,
            email: member.email,
            phone: member.phone,
            source: 'manual_import',
            createdAt: new Date(),
          },
          $set: {
            isLoyaltyMember: true,
            updatedAt: new Date(),
          },
          $addToSet: { tenantIds: tenant._id },
        }

        await db.collection('consumers').updateOne(
          { phoneHash: pHash },
          consumerUpdate,
          { upsert: true }
        )
      }
    }
    console.log('  ✅ Consumers sincronizados')
  }

  // 8. Report
  console.log('\n' + '═'.repeat(60))
  console.log(`📊 REPORTE FINAL ${DRY_RUN ? '(DRY RUN)' : ''}`)
  console.log('═'.repeat(60))
  console.log(`  ✅ Importados:  ${imported}`)
  console.log(`  ⏭️  Skipped:     ${skipped}`)
  console.log(`  ❌ Errores:     ${errors}`)
  if (skippedNames.length > 0) {
    console.log(`\n  Skipped details (primeros 20):`)
    skippedNames.slice(0, 20).forEach(n => console.log(`    - ${n}`))
  }
  console.log('')

  await mongoose.disconnect()
  console.log('👋 Desconectado\n')
}

main().catch(err => {
  console.error('💥 Error fatal:', err)
  process.exit(1)
})
