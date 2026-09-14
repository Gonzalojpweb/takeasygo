import { google } from 'googleapis'
import { decrypt, encrypt } from '@/lib/crypto'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import type { Types } from 'mongoose'

const SCOPES = [
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/crm/google-contacts/callback`
  )
}

export function buildAuthUrl(tenantId: string): string {
  const oauth2 = getOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: tenantId,
    prompt: 'consent',
  })
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = getOAuth2Client()
  const { tokens } = await oauth2.getToken(code)
  return tokens
}

export async function getConnectedEmail(accessToken: string): Promise<string | null> {
  try {
    const oauth2 = getOAuth2Client()
    oauth2.setCredentials({ access_token: accessToken })
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 })
    const { data } = await oauth2Api.userinfo.get()
    return data.email || null
  } catch {
    return null
  }
}

export async function saveTokens(
  tenantId: Types.ObjectId | string,
  tokens: {
    access_token?: string | null
    refresh_token?: string | null
    expiry_date?: number | null
  },
  connectedEmail: string | null
) {
  const update: Record<string, any> = {
    'googleContacts.accessToken': tokens.access_token ? encrypt(tokens.access_token) : null,
    'googleContacts.refreshToken': tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    'googleContacts.expiresAt': tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    'googleContacts.authorizedAt': new Date(),
    'googleContacts.connectedEmail': connectedEmail,
    'googleContacts.isConnected': true,
  }

  await Tenant.updateOne({ _id: tenantId }, { $set: update })
}

export async function disconnect(tenantId: Types.ObjectId | string) {
  await Tenant.updateOne(
    { _id: tenantId },
    {
      $set: {
        'googleContacts.accessToken': null,
        'googleContacts.refreshToken': null,
        'googleContacts.expiresAt': null,
        'googleContacts.isConnected': false,
        'googleContacts.connectedEmail': null,
        'googleContacts.lastDisconnectedAt': new Date(),
      },
    }
  )
}

export async function getAuthenticatedClient(tenantId: Types.ObjectId | string) {
  const tenant = await Tenant.findById(tenantId).lean()
  if (!tenant?.googleContacts?.isConnected) return null
  if (!tenant.googleContacts.refreshToken) return null

  const oauth2 = getOAuth2Client()

  let accessToken: string
  try {
    accessToken = decrypt(tenant.googleContacts.accessToken!)
  } catch {
    await disconnect(tenantId)
    return null
  }

  let refreshToken: string
  try {
    refreshToken = decrypt(tenant.googleContacts.refreshToken!)
  } catch {
    await disconnect(tenantId)
    return null
  }

  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: tenant.googleContacts.expiresAt?.getTime() || undefined,
  })

  oauth2.on('tokens', async (newTokens) => {
    const update: Record<string, any> = {}
    if (newTokens.access_token) {
      update['googleContacts.accessToken'] = encrypt(newTokens.access_token)
    }
    if (newTokens.refresh_token) {
      update['googleContacts.refreshToken'] = encrypt(newTokens.refresh_token)
    }
    if (newTokens.expiry_date) {
      update['googleContacts.expiresAt'] = new Date(newTokens.expiry_date)
    }
    await Tenant.updateOne({ _id: tenantId }, { $set: update })
  })

  return oauth2
}

export async function searchContacts(
  auth: ReturnType<typeof getOAuth2Client>,
  query: string
): Promise<Array<{ resourceName: string; name?: string; email?: string; phone?: string }>> {
  const people = google.people({ version: 'v1', auth })
  const results: Array<{ resourceName: string; name?: string; email?: string; phone?: string }> = []

  let pageToken: string | undefined
  do {
    const res = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: 100,
      pageToken,
      query,
      personFields: 'names,emailAddresses,phoneNumbers',
    })

    for (const person of res.data.connections || []) {
      results.push({
        resourceName: person.resourceName || '',
        name: person.names?.[0]?.displayName,
        email: person.emailAddresses?.[0]?.value,
        phone: person.phoneNumbers?.[0]?.value,
      })
    }

    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  return results
}

export async function listAllConnections(
  auth: ReturnType<typeof getOAuth2Client>
): Promise<Array<{ resourceName: string; name?: string; email?: string; phone?: string }>> {
  const people = google.people({ version: 'v1', auth })
  const results: Array<{ resourceName: string; name?: string; email?: string; phone?: string }> = []

  let pageToken: string | undefined
  do {
    const res = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: 1000,
      pageToken,
      personFields: 'names,emailAddresses,phoneNumbers',
    })

    for (const person of res.data.connections || []) {
      results.push({
        resourceName: person.resourceName || '',
        name: person.names?.[0]?.displayName,
        email: person.emailAddresses?.[0]?.value,
        phone: person.phoneNumbers?.[0]?.value,
      })
    }

    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  return results
}

export async function batchCreateContacts(
  auth: ReturnType<typeof getOAuth2Client>,
  contacts: Array<{ name: string; phone?: string; email?: string }>
): Promise<{ created: number; errors: number }> {
  const people = google.people({ version: 'v1', auth })
  let created = 0
  let errors = 0

  // People API batch limit: 1000 per request
  const BATCH_SIZE = 1000

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE)

    const requests = batch.map((c) => ({
      createContact: {
        contactPreserveOrder: true,
        addresses: [],
        emailAddresses: c.email ? [{ value: c.email }] : [],
        names: [{ givenName: c.name }],
        phoneNumbers: c.phone ? [{ value: c.phone, type: 'mobile' }] : [],
      },
    }))

    try {
      await people.people.batchCreateContacts({
        requestBody: { contacts: requests },
      })
      created += batch.length
    } catch (err: any) {
      console.error('[google-contacts] batch create error:', err.message)
      errors += batch.length
    }
  }

  return { created, errors }
}

export { normalizePhoneForDedup, buildDedupMap, dedupContacts, transformConsumerToGoogle } from './google-contacts-helpers'
export type { GoogleContactInput } from './google-contacts-helpers'

// ── Superadmin (User) token management ──────────────────────────────────────

export async function saveUserTokens(
  userId: string,
  tokens: {
    access_token?: string | null
    refresh_token?: string | null
    expiry_date?: number | null
  },
  connectedEmail: string | null
) {
  const update: Record<string, any> = {
    'googleContacts.accessToken': tokens.access_token ? encrypt(tokens.access_token) : null,
    'googleContacts.refreshToken': tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    'googleContacts.expiresAt': tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    'googleContacts.authorizedAt': new Date(),
    'googleContacts.connectedEmail': connectedEmail,
    'googleContacts.isConnected': true,
  }
  await User.updateOne({ _id: userId }, { $set: update })
}

export async function disconnectUser(userId: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'googleContacts.accessToken': null,
        'googleContacts.refreshToken': null,
        'googleContacts.expiresAt': null,
        'googleContacts.isConnected': false,
        'googleContacts.connectedEmail': null,
      },
    }
  )
}

export async function getAuthenticatedClientForUser(userId: string) {
  const user = await User.findById(userId).lean()
  if (!user?.googleContacts?.isConnected) return null
  if (!user.googleContacts.refreshToken) return null

  const oauth2 = getOAuth2Client()

  let accessToken: string
  try {
    accessToken = decrypt(user.googleContacts.accessToken!)
  } catch {
    await disconnectUser(userId)
    return null
  }

  let refreshToken: string
  try {
    refreshToken = decrypt(user.googleContacts.refreshToken!)
  } catch {
    await disconnectUser(userId)
    return null
  }

  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: user.googleContacts.expiresAt?.getTime() || undefined,
  })

  oauth2.on('tokens', async (newTokens) => {
    const upd: Record<string, any> = {}
    if (newTokens.access_token) upd['googleContacts.accessToken'] = encrypt(newTokens.access_token)
    if (newTokens.refresh_token) upd['googleContacts.refreshToken'] = encrypt(newTokens.refresh_token)
    if (newTokens.expiry_date) upd['googleContacts.expiresAt'] = new Date(newTokens.expiry_date)
    await User.updateOne({ _id: userId }, { $set: upd })
  })

  return oauth2
}

export function buildAuthUrlForUser(userId: string): string {
  const oauth2 = getOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: `user:${userId}`,
    prompt: 'consent',
  })
}
