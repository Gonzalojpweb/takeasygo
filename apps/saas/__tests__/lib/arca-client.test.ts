import { describe, it, expect, vi } from 'vitest'
import forge from 'node-forge'
import { fakeArcaCertificate } from '../fixtures/arca'
import { certificateMatchesKey, generateKeyAndCsr, parseCertificate, signCms } from '@/lib/fiscal/arca/crypto'
import { buildTra, loginCms } from '@/lib/fiscal/arca/wsaa'
import {
  ArcaError,
  caeRequestXml,
  feCaeSolicitar,
  feCompConsultar,
  feCompUltimoAutorizado,
  toArcaAmount,
  toArcaDate,
  type CaeRequest,
} from '@/lib/fiscal/arca/wsfe'

/**
 * Fase 4 — cliente de ARCA (WSAA + WSFEv1) con respuestas simuladas.
 * Docs: ADMIN/FASE4_ARCA_FACTURA_ELECTRONICA.md
 */

const CUIT = '20123456786'

function soap(body: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`,
    { status: 200 }
  )
}

const AUTH = { token: 'TOKEN', sign: 'SIGN', cuit: CUIT }

describe('certificados y firma', () => {
  const creds = generateKeyAndCsr({ cuit: CUIT, legalName: 'Keke & Larry S.A.S.' })

  it('el CSR lleva el CUIT y la razón social sin caracteres raros', () => {
    const csr = forge.pki.certificationRequestFromPem(creds.csrPem)
    expect(csr.verify()).toBe(true)
    const attrs = Object.fromEntries(csr.subject.attributes.map((a) => [a.shortName ?? a.name, a.value]))
    expect(attrs.C).toBe('AR')
    expect(attrs.O).toBe('Keke & Larry S.A.S.')
    expect(attrs.serialNumber).toBe(`CUIT ${CUIT}`)
  })

  it('lee el certificado y verifica que corresponde a la clave', () => {
    const pem = fakeArcaCertificate(creds.csrPem, creds.privateKeyPem)
    const info = parseCertificate(pem)
    expect(info.cuit).toBe(CUIT)
    expect(info.notAfter.getTime()).toBeGreaterThan(Date.now())
    expect(certificateMatchesKey(pem, creds.privateKeyPem)).toBe(true)
    const other = generateKeyAndCsr({ cuit: CUIT, legalName: 'Otro' })
    expect(certificateMatchesKey(pem, other.privateKeyPem)).toBe(false)
    expect(() => parseCertificate('no es un certificado')).toThrow()
  })

  it('firma el TRA como CMS con el contenido adjunto', () => {
    const pem = fakeArcaCertificate(creds.csrPem, creds.privateKeyPem)
    const tra = buildTra(new Date('2026-10-23T15:00:00Z'))
    const cms = signCms(tra, pem, creds.privateKeyPem)
    const der = forge.util.decode64(cms)
    // Contenido ADJUNTO (WSAA lo exige): el TRA viaja dentro del CMS.
    expect(der.includes(tra)).toBe(true)
    const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der)) as forge.pkcs7.PkcsSignedData
    expect(msg.certificates).toHaveLength(1)
    // OID de SHA-256 presente como algoritmo de digest.
    expect(der.includes(forge.asn1.oidToDer(forge.pki.oids.sha256).getBytes())).toBe(true)
  })

  it('el TRA pide el servicio wsfe con ventana de ±10 minutos', () => {
    const tra = buildTra(new Date('2026-10-23T15:00:00Z'))
    expect(tra).toContain('<service>wsfe</service>')
    expect(tra).toContain('<generationTime>2026-10-23T11:50:00-03:00</generationTime>')
    expect(tra).toContain('<expirationTime>2026-10-23T12:10:00-03:00</expirationTime>')
  })
})

describe('WSAA', () => {
  it('extrae token, sign y vencimiento del ticket', async () => {
    const ticket =
      '<?xml version="1.0"?><loginTicketResponse><header><expirationTime>2026-10-24T03:00:00.000-03:00</expirationTime></header>' +
      '<credentials><token>TOK</token><sign>SIG</sign></credentials></loginTicketResponse>'
    const escaped = ticket.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const fetchImpl = vi.fn().mockResolvedValue(soap(`<loginCmsResponse><loginCmsReturn>${escaped}</loginCmsReturn></loginCmsResponse>`))
    const result = await loginCms('homologation', 'CMS', fetchImpl)
    expect(result).toEqual({ token: 'TOK', sign: 'SIG', expiresAt: new Date('2026-10-24T06:00:00.000Z') })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://wsaahomo.afip.gov.ar/ws/services/LoginCms')
  })

  it('"ya posee un TA válido" se explica sin tecnicismos', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(soap('<soap:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soap:Fault>'))
    await expect(loginCms('homologation', 'CMS', fetchImpl)).rejects.toMatchObject({ kind: 'auth', code: 'alreadyAuthenticated' })
  })
})

describe('WSFEv1', () => {
  const request: CaeRequest = {
    pointOfSale: 3,
    cbteTipo: 6,
    concepto: 1,
    docTipo: 99,
    docNro: '0',
    number: 42,
    date: new Date('2026-10-23T18:00:00Z'),
    totalCents: 1_210_000,
    netCents: 1_000_000,
    exemptCents: 0,
    ivaCents: 210_000,
    receiverIvaConditionId: 5,
    iva: [{ afipId: 5, baseCents: 1_000_000, amountCents: 210_000 }],
  }

  it('montos y fechas en el formato de ARCA', () => {
    expect(toArcaAmount(1_210_000)).toBe('12100.00')
    expect(toArcaAmount(5)).toBe('0.05')
    expect(toArcaDate(new Date('2026-10-24T02:30:00Z'))).toBe('20261023') // 23:30 en Argentina
  })

  it('arma el pedido de CAE con IVA, condición del receptor y moneda', () => {
    const xml = caeRequestXml(request)
    expect(xml).toContain('<ar:PtoVta>3</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo>')
    expect(xml).toContain('<ar:CbteDesde>42</ar:CbteDesde><ar:CbteHasta>42</ar:CbteHasta><ar:CbteFch>20261023</ar:CbteFch>')
    expect(xml).toContain('<ar:ImpTotal>12100.00</ar:ImpTotal>')
    expect(xml).toContain('<ar:ImpNeto>10000.00</ar:ImpNeto>')
    expect(xml).toContain('<ar:ImpIVA>2100.00</ar:ImpIVA>')
    expect(xml).toContain('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>')
    expect(xml).toContain('<ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>10000.00</ar:BaseImp><ar:Importe>2100.00</ar:Importe></ar:AlicIva>')
    expect(xml).not.toContain('CbtesAsoc')
  })

  it('aprobado: devuelve CAE y vencimiento', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      soap(
        '<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse>' +
          '<Resultado>A</Resultado><CbteDesde>42</CbteDesde><CAE>76543210987654</CAE><CAEFchVto>20261102</CAEFchVto>' +
          '</FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>'
      )
    )
    const res = await feCaeSolicitar('homologation', AUTH, request, fetchImpl)
    expect(res).toMatchObject({ result: 'A', cae: '76543210987654', number: 42 })
    expect(res.caeExpiresAt?.toISOString().slice(0, 10)).toBe('2026-11-02')
    const [, init] = fetchImpl.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({ SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECAESolicitar"' })
  })

  it('rechazado: devuelve las observaciones de ARCA', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      soap(
        '<FECAESolicitarResponse><FECAESolicitarResult><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><CbteDesde>42</CbteDesde><CAE></CAE>' +
          '<Observaciones><Obs><Code>10016</Code><Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar.</Msg></Obs></Observaciones>' +
          '</FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>'
      )
    )
    const res = await feCaeSolicitar('homologation', AUTH, request, fetchImpl)
    expect(res.result).toBe('R')
    expect(res.cae).toBeNull()
    expect(res.observations[0]).toMatchObject({ code: '10016' })
  })

  it('último autorizado; un CUIT sin el servicio asociado es error de autorización', async () => {
    const ok = vi.fn().mockResolvedValue(soap('<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>3</PtoVta><CbteTipo>6</CbteTipo><CbteNro>41</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>'))
    expect(await feCompUltimoAutorizado('homologation', AUTH, 3, 6, ok)).toBe(41)

    const denied = vi.fn().mockResolvedValue(soap('<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><Errors><Err><Code>601</Code><Msg>CUIT representada no incluida en Token</Msg></Err></Errors></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>'))
    await expect(feCompUltimoAutorizado('homologation', AUTH, 3, 6, denied)).rejects.toMatchObject({ kind: 'auth', code: '601' })
  })

  it('consulta: comprobante existente o inexistente', async () => {
    const found = vi.fn().mockResolvedValue(soap('<FECompConsultarResponse><FECompConsultarResult><ResultGet><ImpTotal>12100</ImpTotal><CodAutorizacion>76543210987654</CodAutorizacion><FchVto>20261102</FchVto><Resultado>A</Resultado></ResultGet></FECompConsultarResult></FECompConsultarResponse>'))
    expect(await feCompConsultar('homologation', AUTH, 3, 6, 42, found)).toMatchObject({ found: true, cae: '76543210987654', totalCents: 1_210_000 })

    const missing = vi.fn().mockResolvedValue(soap('<FECompConsultarResponse><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>No existen datos en nuestros registros para los parametros ingresados.</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse>'))
    expect(await feCompConsultar('homologation', AUTH, 3, 6, 43, missing)).toMatchObject({ found: false })
  })

  it('timeout y errores de red se tipan', async () => {
    const abort = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await expect(feCompUltimoAutorizado('homologation', AUTH, 3, 6, abort)).rejects.toMatchObject({ kind: 'timeout' })
    const down = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    await expect(feCompUltimoAutorizado('homologation', AUTH, 3, 6, down)).rejects.toBeInstanceOf(ArcaError)
  })
})
