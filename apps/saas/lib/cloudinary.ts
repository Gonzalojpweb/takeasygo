import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary'

// La config global del SDK queda SIN credenciales a propósito: cada operación
// lleva las suyas en las options de la llamada (ensureOption prioriza
// options > config global). Así, cualquier call site que no pase credenciales
// falla con "Must supply ..." en vez de subir en silencio a otra cuenta.
cloudinary.config({ hide_sensitive: true })

export type CloudinaryAccount = 'tenant' | 'internal'

export interface CloudinaryCredentials {
  cloud_name: string
  api_key: string
  api_secret: string
}

/**
 * Punto único de decisión de cuenta.
 * 'tenant'   → cuenta nueva: todos los assets que suben/administran tenants.
 * 'internal' → cuenta original (dt6iu9m9f): assets pre-existentes y uso propio.
 * Lanza si faltan credenciales — no existe fallback a otra cuenta.
 */
export function accountCreds(account: CloudinaryAccount): CloudinaryCredentials {
  const cloud_name =
    account === 'tenant' ? process.env.CLOUDINARY_TENANT_CLOUD_NAME : process.env.CLOUDINARY_CLOUD_NAME
  const api_key =
    account === 'tenant' ? process.env.CLOUDINARY_TENANT_API_KEY : process.env.CLOUDINARY_API_KEY
  const api_secret =
    account === 'tenant' ? process.env.CLOUDINARY_TENANT_API_SECRET : process.env.CLOUDINARY_API_SECRET

  const missing: string[] = []
  if (!cloud_name) missing.push(account === 'tenant' ? 'CLOUDINARY_TENANT_CLOUD_NAME' : 'CLOUDINARY_CLOUD_NAME')
  if (!api_key) missing.push(account === 'tenant' ? 'CLOUDINARY_TENANT_API_KEY' : 'CLOUDINARY_API_KEY')
  if (!api_secret) missing.push(account === 'tenant' ? 'CLOUDINARY_TENANT_API_SECRET' : 'CLOUDINARY_API_SECRET')

  if (missing.length > 0) {
    throw new Error(`Faltan credenciales de Cloudinary (cuenta ${account}): ${missing.join(', ')}`)
  }

  return { cloud_name: cloud_name!, api_key: api_key!, api_secret: api_secret! }
}

/**
 * Raíz de carpetas de assets de tenants.
 * Prod: 'takeasygo' (default). Staging: CLOUDINARY_TENANT_FOLDER_ROOT=takeasygo-stg
 * para que los uploads de staging no mezclen con los de producción.
 */
export function folderRoot(): string {
  return process.env.CLOUDINARY_TENANT_FOLDER_ROOT || 'takeasygo'
}

/**
 * Sube un buffer a la cuenta indicada. Envuelve upload_stream + credenciales
 * por llamada y rechaza con el error del SDK (o de accountCreds) si algo falta.
 */
export function uploadBuffer(
  account: CloudinaryAccount,
  buffer: Buffer,
  options: UploadApiOptions
): Promise<UploadApiResponse> {
  const creds = accountCreds(account)

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { ...options, ...creds },
      (error, result) => {
        if (error) reject(error)
        else resolve(result as UploadApiResponse)
      }
    ).end(buffer)
  })
}
