// ============================================================================
// screen-remote.test.ts — administración remota de pantallas (23/11/2026)
// ============================================================================
// · Grupos: una pieza con grupo solo llega a las pantallas de ese grupo; sin
//   grupo, a todas.
// · Acción remota (recargar / volver a bajar): viaja en el manifiesto hasta
//   que la pantalla la confirma en el latido; cambia el ETag.
// · Alertas del panel: sin conexión hace más de 1 h, almacenamiento borrado.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import AppStory from '@/models/AppStory'
import DisplayDevice from '@/models/DisplayDevice'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { POST as heartbeat } from '@/app/api/display/heartbeat/route'
import { GET as listDisplays } from '@/app/api/[tenant]/displays/route'
import { PATCH as patchDevice } from '@/app/api/[tenant]/displays/[deviceId]/route'
import { PATCH as patchPiece } from '@/app/api/[tenant]/screen-pieces/[pieceId]/route'
import { auth } from '@/lib/auth'
import { generateDisplayToken, hashDisplayToken } from '@/lib/display/auth'
import { deviceAlerts, type DisplayRow } from '@/components/admin/displays/DisplaysManager'

let A: any, loc: any, token: string, device: any, piece: any

beforeEach(async () => {
  vi.clearAllMocks()
  A = await Tenant.create({ slug: 'sr-a', name: 'A', isActive: true, status: 'active', plan: 'high' })
  loc = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  token = generateDisplayToken()
  device = await DisplayDevice.create({ status: 'active', tenantId: A._id, locationId: loc._id, name: 'TV', orientation: 'landscape', tokenHash: hashDisplayToken(token) })
  piece = await AppStory.create({ title: 'P', surfaces: ['screen'], owner: { kind: 'tenant', tenantId: A._id, locationId: null }, imageUrl: 'https://res.cloudinary.com/x/image/upload/a.jpg', isActive: true, media: { orientation: 'landscape', bytes: 10 } })
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin', tenantId: String(A._id), assignedLocations: [] }, expires: '' } as any)
})

const getManifest = (h: Record<string, string> = {}) => manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}`, ...h } }))
const json = (url: string, method: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
const devPatch = (body: unknown) => patchDevice(json(`/api/sr-a/displays/${device._id}`, 'PATCH', body), { params: Promise.resolve({ tenant: 'sr-a', deviceId: String(device._id) }) })

describe('grupos', () => {
  it('pieza con grupo solo a esas pantallas; sin grupo a todas', async () => {
    const r = await patchPiece(json(`/api/sr-a/screen-pieces/${piece._id}`, 'PATCH', { screenGroups: ['Vidriera'] }), { params: Promise.resolve({ tenant: 'sr-a', pieceId: String(piece._id) }) })
    expect(r.status).toBe(200)
    expect((await r.json()).piece.screenGroups).toEqual(['Vidriera'])
    expect((await (await getManifest()).json()).items).toHaveLength(0)
    expect((await devPatch({ group: 'Vidriera' })).status).toBe(200)
    expect((await (await getManifest()).json()).items).toHaveLength(1)
    await devPatch({ group: 'Salón' })
    expect((await (await getManifest()).json()).items).toHaveLength(0)
    await patchPiece(json(`/api/sr-a/screen-pieces/${piece._id}`, 'PATCH', { screenGroups: [] }), { params: Promise.resolve({ tenant: 'sr-a', pieceId: String(piece._id) }) })
    expect((await (await getManifest()).json()).items).toHaveLength(1)
  })
})

describe('acción remota', () => {
  it('viaja en el manifiesto hasta que la pantalla la confirma; cambia el ETag; el panel la ve pendiente', async () => {
    const first = await getManifest()
    const etag = first.headers.get('etag')!
    expect((await first.json()).command).toBeNull()
    expect((await devPatch({ command: 'resync' })).status).toBe(200)
    const r2 = await getManifest({ 'if-none-match': etag })
    expect(r2.status).toBe(200)
    const m2 = await r2.json()
    expect(m2.command).toMatchObject({ type: 'resync' })
    expect(m2.command.id).toMatch(/^[a-f0-9]{16}$/)
    const list = await (await listDisplays(json('/api/sr-a/displays', 'GET'), { params: Promise.resolve({ tenant: 'sr-a' }) })).json()
    expect(list.devices[0].pendingCommand).toBe('resync')
    const hb = await heartbeat(json('/api/display/heartbeat', 'POST', { commandAck: m2.command.id }))
    expect(hb.status).toBe(200)
    expect((await (await getManifest()).json()).command).toBeNull()
    const list2 = await (await listDisplays(json('/api/sr-a/displays', 'GET'), { params: Promise.resolve({ tenant: 'sr-a' }) })).json()
    expect(list2.devices[0].pendingCommand).toBeNull()
  })

  it('acción inválida → 400', async () => {
    expect((await devPatch({ command: 'formatear' })).status).toBe(400)
  })
})

describe('alertas del panel', () => {
  const row = (over: Partial<DisplayRow>): DisplayRow => ({ _id: 'x', name: 'TV', orientation: 'landscape', status: 'active', locationId: null, locationName: null, lastSeenAt: new Date().toISOString(), online: true, appVersion: null, screen: null, cache: null, lastError: null, group: null, pendingCommand: null, ...over })
  it('sin conexión hace más de 1 h, almacenamiento borrado; esperando el primer contacto no alerta', () => {
    const now = Date.now()
    expect(deviceAlerts(row({}), now)).toEqual([])
    expect(deviceAlerts(row({ lastSeenAt: new Date(now - 2 * 3600_000).toISOString() }), now)).toEqual(['sin conexión hace más de 1 h'])
    expect(deviceAlerts(row({ lastError: { code: 'storage_evicted', message: 'x', at: new Date(now - 60_000).toISOString() } }), now)).toEqual(['el navegador borró lo guardado'])
    expect(deviceAlerts(row({ status: 'claimed', lastSeenAt: null }), now)).toEqual([])
  })
})
