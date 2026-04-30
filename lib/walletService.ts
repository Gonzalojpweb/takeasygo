/**
 * WALLET SERVICE — Generador de Tarjetas Digitales
 * 
 * Integra Google Wallet API y Apple PassKit para el Club de Fidelización.
 * 
 * Arquitectura:
 * - Google Wallet: JWT firmados + API REST
 * - Apple Wallet: Archivos .pkpass firmados con certificados
 * 
 * Seguridad:
 * - publicId (no expone ObjectId de MongoDB)
 * - Tokens firmados con expiración corta
 */

import { GoogleAuth } from 'google-auth-library'
import { connectDB } from './mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'
import crypto from 'crypto'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN Y CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_WALLET_ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID || ''
const GOOGLE_WALLET_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY || ''

const APPLE_PASS_TYPE_IDENTIFIER = process.env.APPLE_PASS_TYPE_IDENTIFIER || 'pass.com.takeasygo.loyalty'
const APPLE_TEAM_IDENTIFIER = process.env.APPLE_TEAM_IDENTIFIER || ''
const APPLE_CERTIFICATE_P12 = process.env.APPLE_CERTIFICATE_P12 || '' // Base64 encoded
const APPLE_CERTIFICATE_PASSWORD = process.env.APPLE_CERTIFICATE_PASSWORD || ''
const APPLE_WWDR_CERT = process.env.APPLE_WWDR_CERT || '' // Apple WWDR certificate

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface WalletPassData {
  publicId: string
  memberName: string
  points: number
  tier: 'none' | 'bronze' | 'silver' | 'gold'
  clubName: string
  tenantName: string
  logoUrl: string
  cardColor: string
  labelColor: string
}

export interface GoogleWalletJWT {
  iss: string
  aud: string
  typ: string
  iat: number
  exp: number
  origins: string[]
  payload: {
    loyaltyObjects: any[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE WALLET SERVICE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera un JWT firmado para el botón "Add to Google Wallet"
 * El cliente usa este JWT para añadir la tarjeta a su billetera.
 */
export async function generateGoogleWalletJWT(
  memberId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId
): Promise<{ jwt: string; objectId: string } | null> {
  try {
    await connectDB()

    console.log('[WalletService] GOOGLE_WALLET_SERVICE_ACCOUNT_KEY:', !!GOOGLE_WALLET_SERVICE_ACCOUNT_KEY)
    console.log('[WalletService] GOOGLE_WALLET_ISSUER_ID:', GOOGLE_WALLET_ISSUER_ID)

    if (!GOOGLE_WALLET_SERVICE_ACCOUNT_KEY || !GOOGLE_WALLET_ISSUER_ID) {
      console.warn('[WalletService] Google Wallet no configurado - faltan variables de entorno')
      return null
    }

    const member = await LoyaltyMember.findById(memberId).lean()
    const tenant = await Tenant.findById(tenantId).lean()

    console.log('[WalletService] Member encontrado:', !!member, 'Tenant encontrado:', !!tenant)

    if (!member || !tenant) return null

    // IDs únicos para Google Wallet
    const classId = `${GOOGLE_WALLET_ISSUER_ID}.LoyaltyClass_${tenant._id}`
    const objectId = `${GOOGLE_WALLET_ISSUER_ID}.LoyaltyObject_${member.wallet.publicId}`

    // Autenticación con Service Account
    const credentials = JSON.parse(GOOGLE_WALLET_SERVICE_ACCOUNT_KEY)
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
    })

    const client = await auth.getClient()

    // Crear o actualizar LoyaltyClass (plantilla del tenant)
    await ensureGoogleLoyaltyClass(tenant, classId, client)

    // Crear LoyaltyObject (instancia del miembro)
    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: 'active',
      accountId: member.wallet.publicId,
      accountName: member.name,
      loyaltyPoints: {
        balance: {
          int: member.loyalty.points
        },
        label: 'Puntos'
      },
      barcode: {
        type: 'QR_CODE',
        value: member.wallet.publicId,
        alternateText: member.wallet.publicId
      },
      textModulesData: [
        {
          header: 'Nivel',
          body: getTierLabel(member.loyalty.tier)
        }
      ]
    }

    // Generar JWT para el botón "Add to Wallet"
    const jwtPayload = {
      iss: credentials.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hora
      payload: {
        loyaltyObjects: [loyaltyObject]
      }
    }

    // Firmar JWT
    const token = jwt.sign(jwtPayload, credentials.private_key, { algorithm: 'RS256' })

    // Guardar referencia en el miembro
    await LoyaltyMember.updateOne(
      { _id: member._id },
      { 
        $set: { 
          'wallet.googleObjectId': objectId,
          'wallet.installedAt': new Date()
        }
      }
    )

    return { jwt: token, objectId }

  } catch (error) {
    console.error('[WalletService] Error generando Google JWT:', error)
    return null
  }
}

/**
 * Asegura que exista la LoyaltyClass para el tenant (plantilla)
 */
async function ensureGoogleLoyaltyClass(
  tenant: any,
  classId: string,
  client: any
): Promise<void> {
  try {
    const logoUrl = tenant.wallet?.logoUrl || tenant.branding?.logoUrl || ''
    
    // Si no hay logo, usar un placeholder genérico o dejar vacío
    const programLogo = logoUrl 
      ? { sourceUri: { uri: logoUrl } }
      : undefined

    const loyaltyClass = {
      id: classId,
      issuerName: tenant.name || 'TakeasyGO',
      programName: tenant.loyalty?.clubName || `Club ${tenant.name}`,
      ...(programLogo && { programLogo }),
      hexBackgroundColor: tenant.wallet?.cardColor || '#000000',
      hexFontColor: tenant.wallet?.labelColor || '#FFFFFF',
      reviewStatus: 'underReview' // Requerido por Google Wallet para nuevas clases
    }

    console.log('[WalletService] Creando LoyaltyClass:', JSON.stringify(loyaltyClass, null, 2))

    // Intentar crear, si ya existe ignorar el error 409
    // Si falla por permisos (403), asumir que ya existe o continuar sin crearla
    await (client as any).request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass`,
      method: 'POST',
      body: JSON.stringify(loyaltyClass),
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch((err: any) => {
      console.log('[WalletService] Error creando LoyaltyClass:', err.code, err.message)
      // Ignorar errores 409 (ya existe) y 403 (permisos - asumir que ya existe)
      if (err.code !== 409 && err.code !== 403) throw err
    })

  } catch (error) {
    console.error('[WalletService] Error creando LoyaltyClass:', error)
    throw error
  }
}

/**
 * Actualiza los puntos en Google Wallet
 * Se llama después de cada compra que suma/resta puntos
 */
export async function updateGoogleWalletPoints(
  googleObjectId: string,
  newPoints: number
): Promise<boolean> {
  try {
    if (!GOOGLE_WALLET_SERVICE_ACCOUNT_KEY) return false

    const credentials = JSON.parse(GOOGLE_WALLET_SERVICE_ACCOUNT_KEY)
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
    })

    const client = await auth.getClient()

    await (client as any).request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${googleObjectId}`,
      method: 'PATCH',
      body: {
        loyaltyPoints: {
          balance: { int: newPoints }
        }
      }
    })

    return true

  } catch (error) {
    console.error('[WalletService] Error actualizando puntos Google:', error)
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLE WALLET SERVICE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera un archivo .pkpass para Apple Wallet
 * 
 * NOTA: Para producción completa se requiere:
 * - Certificado P12 de Apple Developer (Pass Type ID)
 * - Contraseña del certificado
 * - Certificado WWDR de Apple
 * 
 * Este es un generador básico que puede extenderse con firma completa
 */
export async function generateAppleWalletPass(
  memberId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId
): Promise<Buffer | null> {
  try {
    await connectDB()

    const member = await LoyaltyMember.findById(memberId).lean()
    const tenant = await Tenant.findById(tenantId).lean()

    if (!member || !tenant) return null

    // Datos del pase
    const passData: WalletPassData = {
      publicId: member.wallet.publicId,
      memberName: member.name,
      points: member.loyalty.points,
      tier: member.loyalty.tier,
      clubName: tenant.loyalty.clubName || `Club ${tenant.name}`,
      tenantName: tenant.name,
      logoUrl: tenant.wallet?.logoUrl || tenant.branding?.logoUrl || '',
      cardColor: tenant.wallet?.cardColor || '#000000',
      labelColor: tenant.wallet?.labelColor || '#FFFFFF'
    }

    // Generar manifest.json
    const manifest: Record<string, string> = {}

    // Contenido del pase (pass.json)
    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: tenant.wallet?.applePassTypeIdentifier || APPLE_PASS_TYPE_IDENTIFIER,
      serialNumber: member.wallet.publicId,
      teamIdentifier: tenant.wallet?.appleTeamIdentifier || APPLE_TEAM_IDENTIFIER,
      organizationName: tenant.name,
      description: passData.clubName,
      logoText: tenant.name,
      foregroundColor: passData.labelColor,
      backgroundColor: passData.cardColor,
      barcode: {
        message: passData.publicId,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1'
      },
      storeCard: {
        primaryFields: [
          {
            key: 'points',
            label: 'Puntos',
            value: passData.points
          }
        ],
        secondaryFields: [
          {
            key: 'tier',
            label: 'Nivel',
            value: getTierLabel(passData.tier)
          }
        ],
        backFields: [
          {
            key: 'memberId',
            label: 'Número de Miembro',
            value: passData.publicId
          },
          {
            key: 'instructions',
            label: 'Instrucciones',
            value: 'Muestra este código en el local para acumular o canjear puntos.'
          }
        ]
      },
      // Web Service para actualizaciones push
      webServiceURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/wallet/apple`,
      authenticationToken: generateAuthToken(member._id.toString())
    }

    // En una implementación completa:
    // 1. Crear ZIP con pass.json, imágenes, manifest.json
    // 2. Firmar manifest.json con certificado P12
    // 3. Añadir signature al ZIP
    // 4. Renombrar a .pkpass
    
    // Por ahora, retornamos el JSON del pase como Buffer
    // TODO: Implementar firma completa con certificados Apple
    console.log('[WalletService] Generando pase Apple:', passJson)
    
    return Buffer.from(JSON.stringify(passJson, null, 2))

  } catch (error) {
    console.error('[WalletService] Error generando Apple Pass:', error)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────

function getTierLabel(tier: string): string {
  const labels: Record<string, string> = {
    'none': 'Miembro',
    'bronze': 'Bronce',
    'silver': 'Plata',
    'gold': 'Oro'
  }
  return labels[tier] || 'Miembro'
}

/**
 * Genera token de autenticación para Apple Web Service
 * El token se valida en los endpoints de actualización
 */
function generateAuthToken(memberId: string): string {
  const secret = process.env.WALLET_WEB_SERVICE_SECRET || 'default-secret-change-this'
  const timestamp = Math.floor(Date.now() / 1000)
  const data = `${memberId}:${timestamp}`
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * Verifica un token de autenticación de Apple Web Service
 */
export function verifyAuthToken(token: string, memberId: string, maxAge: number = 86400): boolean {
  const secret = process.env.WALLET_WEB_SERVICE_SECRET || 'default-secret-change-this'
  
  // Generar tokens para las últimas 24 horas y verificar coincidencia
  const now = Math.floor(Date.now() / 1000)
  for (let i = 0; i <= maxAge; i += 3600) {
    const timestamp = now - i
    const data = `${memberId}:${timestamp}`
    const expectedToken = crypto.createHmac('sha256', secret).update(data).digest('hex')
    if (token === expectedToken) return true
  }
  
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// SINCRONIZACIÓN DE PUNTOS (Trigger desde órdenes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Se llama automáticamente cuando un miembro acumula/gasta puntos
 * Sincroniza con Google Wallet y notifica a Apple Wallet vía push
 */
export async function syncWalletPoints(
  memberId: string | mongoose.Types.ObjectId
): Promise<{ google: boolean; apple: boolean }> {
  try {
    await connectDB()

    const member = await LoyaltyMember.findById(memberId).lean()
    if (!member || !member.wallet) {
      return { google: false, apple: false }
    }

    const results = { google: false, apple: false }

    // Sincronizar con Google Wallet
    if (member.wallet.googleObjectId) {
      results.google = await updateGoogleWalletPoints(
        member.wallet.googleObjectId,
        member.loyalty.points
      )
    }

    // Notificar a Apple Wallet (enviar push para que el dispositivo solicite actualización)
    if (member.wallet.pushToken && member.wallet.appleDeviceLibraryIdentifier) {
      // TODO: Enviar notificación push APNs
      // results.apple = await sendApplePushNotification(member.wallet.pushToken)
      console.log('[WalletService] Apple Push Token disponible:', member.wallet.pushToken)
    }

    // Actualizar timestamp de sincronización
    await LoyaltyMember.updateOne(
      { _id: member._id },
      { $set: { 'wallet.lastSyncAt': new Date() } }
    )

    return results

  } catch (error) {
    console.error('[WalletService] Error sincronizando puntos:', error)
    return { google: false, apple: false }
  }
}
