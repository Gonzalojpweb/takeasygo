import forge from 'node-forge'

// ============================================================================
// Criptografía para ARCA — clave, pedido de certificado (CSR) y firma CMS
// ============================================================================
// Fase 4 de caja (2026-10). Docs: ADMIN/FASE4_ARCA_FACTURA_ELECTRONICA.md.
//
//   · La clave privada se genera EN EL SERVIDOR (RSA 2048) y se guarda
//     cifrada (lib/crypto, AES-256-GCM). El comercio solo descarga el CSR,
//     lo sube a ARCA y nos devuelve el certificado: nunca maneja la clave.
//   · Sujeto del CSR según el manual de WSAA: C=AR, O=<razón social>,
//     CN=<alias>, serialNumber=CUIT <cuit>.
//   · El pedido de acceso (TRA) se firma como CMS/PKCS#7 SignedData con el
//     contenido adjunto y SHA-256, en base64 (LoginCms).
// ============================================================================

export interface GeneratedCredentials {
  privateKeyPem: string
  csrPem: string
}

/** Genera la clave privada y el CSR para el CUIT del comercio. */
export function generateKeyAndCsr(input: { cuit: string; legalName: string; alias?: string }): GeneratedCredentials {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey
  // Solo caracteres imprimibles ASCII en el sujeto: ARCA rechaza otros.
  const clean = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 .,&-]/g, '')
      .trim()
      .slice(0, 60) || 'Comercio'
  csr.setSubject([
    { shortName: 'C', value: 'AR' },
    { shortName: 'O', value: clean(input.legalName) },
    { shortName: 'CN', value: clean(input.alias ?? `takeasygo-${input.cuit}`) },
    { name: 'serialNumber', value: `CUIT ${input.cuit}` },
  ])
  csr.sign(keys.privateKey, forge.md.sha256.create())
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    csrPem: forge.pki.certificationRequestToPem(csr),
  }
}

export interface CertificateInfo {
  subject: string
  notBefore: Date
  notAfter: Date
  /** CUIT del serialNumber del sujeto ("CUIT 20123456786"), si está. */
  cuit: string | null
}

/** Lee un certificado PEM. Lanza si no es un certificado X.509 válido. */
export function parseCertificate(pem: string): CertificateInfo {
  let cert: forge.pki.Certificate
  try {
    cert = forge.pki.certificateFromPem(pem.trim())
  } catch {
    throw new Error('El archivo no es un certificado válido (esperado: -----BEGIN CERTIFICATE-----)')
  }
  const attr = (name: string) => cert.subject.attributes.find((a) => a.name === name || a.shortName === name)?.value
  const serial = String(attr('serialNumber') ?? '')
  const cuit = /(\d{11})/.exec(serial)?.[1] ?? null
  return {
    subject: [attr('CN'), attr('O')].filter(Boolean).join(' · '),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    cuit,
  }
}

/** ¿El certificado corresponde a esta clave privada? (mismo módulo RSA). */
export function certificateMatchesKey(certPem: string, privateKeyPem: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certPem.trim())
    const key = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey
    const pub = cert.publicKey as forge.pki.rsa.PublicKey
    return pub.n.equals(key.n) && pub.e.equals(key.e)
  } catch {
    return false
  }
}

/** Firma el TRA como CMS SignedData (contenido adjunto) y lo devuelve en base64. */
export function signCms(content: string, certPem: string, privateKeyPem: string): string {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(content, 'utf8')
  const cert = forge.pki.certificateFromPem(certPem.trim())
  p7.addCertificate(cert)
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(privateKeyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  })
  p7.sign()
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}
