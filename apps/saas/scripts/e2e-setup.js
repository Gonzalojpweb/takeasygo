/**
 * Prepara el tenant E2E para simular el fallo real de MercadoPago.
 *
 * Cuenta MP con token BASURA a propósito → el SDK de MP rechaza la llamada
 * igual que le pasó al cliente real ("Este fallo, por problemas internos
 * del tenant").
 *
 * Uso: node scripts/e2e-setup.js          (crea)
 *      node scripts/e2e-setup.js --clean  (borra)
 */
const { MongoClient, ObjectId } = require('mongodb')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Carga .env.local (node plano no lo carga solo; sí lo hace next dev)
for (const f of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', f)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
}

const SLUG = 'e2e-mp-test'
const LOCATION_ID = new ObjectId()

// Token MP basura a propósito: el SDK lo manda a la API real y MP responde
// 401 invalid_client — igual que el fallo del tenant real.
const GARBAGE_MP_TOKEN = 'APP_USR-0000000000000000-000000-00000000000000000000000000000000-000000000'

function encrypt(text) {
  const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`
}

async function run() {
  const c = new MongoClient(process.env.MONGODB_URI)
  await c.connect()
  const db = c.db()
  const clean = process.argv.includes('--clean')

  if (clean) {
    const t = await db.collection('tenants').findOne({ slug: SLUG })
    if (t) {
      await db.collection('orders').deleteMany({ tenantId: t._id })
      await db.collection('locations').deleteMany({ tenantId: t._id })
      await db.collection('menus').deleteMany({ tenantId: t._id })
    }
    await db.collection('tenants').deleteOne({ slug: SLUG })
    console.log('E2E tenant eliminado')
    await c.close()
    return
  }

  await db.collection('tenants').deleteOne({ slug: SLUG })
  await db.collection('tenants').insertOne({
    _id: new ObjectId(),
    name: 'E2E MP Test',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    branding: {
      backgroundColor: '#ffffff',
      textColor: '#111111',
      primaryColor: '#f74211',
      logoUrl: '',
    },
    mpAccounts: [
      {
        _id: new ObjectId(),
        label: 'CREDENCIALES ROTAS (E2E)',
        accessToken: encrypt(GARBAGE_MP_TOKEN),
        publicKey: 'e2e-public-key',
        webhookSecret: 'e2e-webhook-secret',
        isActive: true,
        oauthAccessToken: null,
        oauthIsConnected: false,
        oauthExpiresAt: null,
      },
    ],
  })

  await db.collection('locations').insertOne({
    _id: LOCATION_ID,
    tenantId: (await db.collection('tenants').findOne({ slug: SLUG }))._id,
    name: 'Sede E2E',
    slug: 'sede-e2e',
    address: 'Av. E2E 1000',
    isActive: true,
    settings: { mpAccountId: null },
  })

  const t = await db.collection('tenants').findOne({ slug: SLUG })
  await db.collection('locations').updateOne(
    { _id: LOCATION_ID },
    { $set: { 'settings.mpAccountId': t.mpAccounts[0]._id.toHexString() } }
  )

  console.log('E2E tenant creado:', SLUG)
  console.log('  locationId:', LOCATION_ID.toHexString())
  console.log('  mpAccountId:', t.mpAccounts[0]._id.toHexString())
  await c.close()
}
run().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
