import forge from 'node-forge'

// Fixtures de ARCA para tests (Fase 4 de caja).

/** Certificado "de ARCA" simulado: firmado con la clave del CSR (autofirmado). */
export function fakeArcaCertificate(csrPem: string, privateKeyPem: string, cuit = '20123456786', days = 730): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem)
  const cert = forge.pki.createCertificate()
  cert.publicKey = csr.publicKey as forge.pki.PublicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 60_000)
  cert.validity.notAfter = new Date(Date.now() + days * 86_400_000)
  cert.setSubject([
    { shortName: 'CN', value: 'takeasygo' },
    { name: 'serialNumber', value: `CUIT ${cuit}` },
  ])
  cert.setIssuer([{ shortName: 'CN', value: 'AFIP Testing' }])
  cert.sign(forge.pki.privateKeyFromPem(privateKeyPem), forge.md.sha256.create())
  return forge.pki.certificateToPem(cert)
}

/** Respuesta SOAP simulada. */
export function soapResponse(body: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`,
    { status: 200 }
  )
}
