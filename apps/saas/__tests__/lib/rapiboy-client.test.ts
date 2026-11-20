// Contrato del cliente Rapiboy contra la documentación oficial (OpenAPI de
// rapiboy.com/documentacionapi, 20/11/2026): rutas, métodos, nombres de campo,
// unidades (pesos → centavos) y respuestas sin cuerpo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/crypto', () => ({
  decrypt: (v: string) => `plain-${v}`,
}))

import {
  buildCrearViajeBody,
  cancelarViaje,
  consultarViaje,
  cotizarOnDemand,
  crearViajeOnDemand,
  obtenerEstados,
  obtenerEvidencias,
  obtenerMotivosCancelacion,
  parsePedido,
  pesosToCents,
  RapiboyError,
  type RapiboyConfig,
} from '@/lib/rapiboy/client'

const CFG: RapiboyConfig = { apiToken: 'enc', environment: 'uat', codigoPlataforma: 'TGO' }
const ORIGEN = { lat: -34.583293, lng: -58.392263, address: 'Av. Origen 1' }
const DESTINO = { lat: -34.603712, lng: -58.381533, address: 'Calle Destino 2' }

let fetchMock: ReturnType<typeof vi.fn>

function respond(status: number, body: unknown) {
  const text = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body))
  fetchMock.mockResolvedValueOnce(new Response(text, { status }))
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url: String(url), init: init as RequestInit, body: init?.body ? JSON.parse(String(init.body)) : null }
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pesosToCents', () => {
  it('número y textos en distintos formatos', () => {
    expect(pesosToCents(100.5)).toBe(10050)
    expect(pesosToCents('100.50')).toBe(10050)
    expect(pesosToCents('$ 1.234,50')).toBe(123450)
    expect(pesosToCents('1,234.50')).toBe(123450)
    expect(pesosToCents(null)).toBeNull()
    expect(pesosToCents('')).toBeNull()
  })
})

describe('cotizarOnDemand', () => {
  it('POST /v1/OnDemandSmart/Cotizar con Token y coordenadas; Precio en pesos → centavos', async () => {
    respond(200, { Precio: 2500.5 })
    const r = await cotizarOnDemand(ORIGEN, DESTINO, CFG)
    const { url, init, body } = lastCall()
    expect(url).toBe('https://uat.rapiboy.com/v1/OnDemandSmart/Cotizar')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Token).toBe('plain-enc')
    expect(body).toEqual({
      LatitudOrigen: ORIGEN.lat, LongitudOrigen: ORIGEN.lng,
      LatitudDestino: DESTINO.lat, LongitudDestino: DESTINO.lng,
    })
    expect(r).toEqual({ precio: 250050, vigencia: 3 })
  })

  it('producción usa https://rapiboy.com', async () => {
    respond(200, { Precio: 1 })
    await cotizarOnDemand(ORIGEN, DESTINO, { ...CFG, environment: 'production' })
    expect(lastCall().url).toBe('https://rapiboy.com/v1/OnDemandSmart/Cotizar')
  })

  it('400 con { Message } → RapiboyError con apiMessage', async () => {
    respond(400, { Message: 'No hay repartidores disponibles' })
    const err = await cotizarOnDemand(ORIGEN, DESTINO, CFG).catch(e => e)
    expect(err).toBeInstanceOf(RapiboyError)
    expect(err.status).toBe(400)
    expect(err.apiMessage).toBe('No hay repartidores disponibles')
    expect(err.isUncertain).toBe(false)
  })

  it('sin precio válido → error (no se cobra un envío de $0)', async () => {
    respond(200, { Precio: 0 })
    await expect(cotizarOnDemand(ORIGEN, DESTINO, CFG)).rejects.toBeInstanceOf(RapiboyError)
  })

  it('error de red → RapiboyError incierto', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const err = await cotizarOnDemand(ORIGEN, DESTINO, CFG).catch(e => e)
    expect(err.status).toBe(0)
    expect(err.isUncertain).toBe(true)
  })
})

describe('crearViajeOnDemand', () => {
  const params = {
    orderNumber: 'TGO-123',
    origen: ORIGEN,
    destino: DESTINO,
    originName: 'Local Centro',
    customerName: 'Ana',
    customerPhone: '1155555555',
    customerEmail: 'ana@example.com',
    destinationCity: 'CABA',
    apt: '3B',
    observaciones: 'Timbre roto',
  }

  it('cuerpo con los nombres de campo de CrearPedido y EsOnDemand=true', () => {
    const body = buildCrearViajeBody(params, CFG)
    expect(body).toMatchObject({
      EsOnDemand: true,
      ReferenciaExterna: 'TGO-123',
      CodigoPlataforma: 'TGO',
      NombreOrigen: 'Local Centro',
      DireccionOrigen: 'Av. Origen 1',
      LatitudOrigen: ORIGEN.lat,
      LongitudOrigen: ORIGEN.lng,
      NombreDestino: 'Ana',
      DireccionDestino: 'Calle Destino 2',
      CiudadDestino: 'CABA',
      TelefonoDestino: '1155555555',
      EmailDestino: 'ana@example.com',
      Departamento: '3B',
      ObservacionDestino: 'Timbre roto',
      LatitudDestino: DESTINO.lat,
      LongitudDestino: DESTINO.lng,
      TiempoDeCocina: 0,
    })
    // Campos viejos que Rapiboy no conoce
    expect(body).not.toHaveProperty('Nombre')
    expect(body).not.toHaveProperty('Telefono')
    expect(body).not.toHaveProperty('Observaciones')
  })

  it('POST /v1/Viaje/Post; IdPedido, Link y Precio (texto) de CrearPedidoRespuesta', async () => {
    respond(200, {
      IdPedido: 900001, TrackingId: '900001', TrackingEncriptado: 'ENC',
      Link: 'https://uat.rapiboy.com/seguimientoPedido?id=ENC', Estado: 10, Precio: '100.50',
    })
    const r = await crearViajeOnDemand(params, CFG)
    expect(lastCall().url).toBe('https://uat.rapiboy.com/v1/Viaje/Post')
    expect(lastCall().init.method).toBe('POST')
    expect(r).toEqual({
      tripId: '900001', trackingId: '900001', trackingEncriptado: 'ENC',
      trackingUrl: 'https://uat.rapiboy.com/seguimientoPedido?id=ENC', estado: 10, precio: 10050,
    })
  })

  it('sin IdPedido → error (no se da por creado)', async () => {
    respond(200, { Precio: '100' })
    await expect(crearViajeOnDemand(params, CFG)).rejects.toBeInstanceOf(RapiboyError)
  })

  it('un Link que no es https no se usa', async () => {
    respond(200, { IdPedido: 1, Link: 'javascript:alert(1)' })
    expect((await crearViajeOnDemand(params, CFG)).trackingUrl).toBe('')
  })
})

describe('cancelarViaje', () => {
  it('PUT /v1/OnDemandSmart/Cancel con IdPedido numérico; 200 sin cuerpo no es error', async () => {
    respond(200, undefined)
    await expect(cancelarViaje('900001', 12, CFG)).resolves.toBeUndefined()
    const { url, init, body } = lastCall()
    expect(url).toBe('https://uat.rapiboy.com/v1/OnDemandSmart/Cancel')
    expect(init.method).toBe('PUT')
    expect(body).toEqual({ IdPedido: 900001, IdMotivo: 12 })
  })

  it('IdPedido no numérico → error sin llamar a Rapiboy', async () => {
    await expect(cancelarViaje('abc', 12, CFG)).rejects.toBeInstanceOf(RapiboyError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('consultarViaje / parsePedido', () => {
  it('GET GetQuery por IdPedido (query string, sin cuerpo) y lee Unico', async () => {
    respond(200, {
      Resultado: true,
      Unico: { IdPedido: 900001, Estado: 12, EstadoNombre: 'Retirado', RepartidorOnDemand: 'Carlos', TrackingUrl_OnDemand: 'https://t/x', PrecioDouble: 100.5 },
    })
    const p = await consultarViaje({ idPedido: '900001' }, CFG)
    const { url, init } = lastCall()
    expect(url).toBe('https://uat.rapiboy.com/v1/OnDemandSmart/GetQuery?IdPedido=900001')
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.body).toBeUndefined()
    expect(p).toMatchObject({ idPedido: '900001', estado: 12, driverName: 'Carlos', trackingUrl: 'https://t/x', precio: 10050 })
  })

  it('por ReferenciaExterna; Resultado=false → null', async () => {
    respond(200, { Resultado: false, Mensaje: 'No encontrado' })
    expect(await consultarViaje({ referenciaExterna: 'TGO-1' }, CFG)).toBeNull()
    expect(lastCall().url).toContain('ReferenciaExterna=TGO-1')
  })

  it('nunca toma NombreDestino (el cliente) como repartidor', () => {
    expect(parsePedido({ IdPedido: 1, Estado: 11, NombreDestino: 'Cliente' })!.driverName).toBe('')
  })
})

describe('evidencias y catálogos', () => {
  it('Evidencias: GET por IdPedido; solo archivos https', async () => {
    respond(200, [
      { Titulo: 'Nombre de quien recibe:', Texto: 'Ana', Archivo: null },
      { Titulo: 'Foto', Texto: '', Archivo: 'https://cdn.rapiboy.com/f.jpg' },
      { Titulo: 'Raro', Texto: '', Archivo: 'http://inseguro/f.jpg' },
    ])
    const ev = await obtenerEvidencias('900001', CFG)
    expect(lastCall().url).toBe('https://uat.rapiboy.com/v1/OnDemandSmart/Evidencias?IdPedido=900001')
    expect(ev.map(e => e.archivo)).toEqual([null, 'https://cdn.rapiboy.com/f.jpg', null])
  })

  it('Estados y MotivosCancelado: rutas /v1/LastMile y campo Valor', async () => {
    respond(200, [{ $id: '1', Id: 10, Valor: 'ProcesandoPedido' }])
    expect(await obtenerEstados(CFG)).toEqual([{ id: 10, nombre: 'ProcesandoPedido' }])
    expect(lastCall().url).toBe('https://uat.rapiboy.com/v1/LastMile/Estados')
    respond(200, [{ $id: '1', Id: 12, Valor: 'Otro' }])
    expect(await obtenerMotivosCancelacion(CFG)).toEqual([{ id: 12, nombre: 'Otro' }])
    expect(lastCall().url).toBe('https://uat.rapiboy.com/v1/LastMile/MotivosCancelado')
  })
})
