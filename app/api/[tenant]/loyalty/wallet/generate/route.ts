/**
 * API Endpoint: Generar Tarjeta Digital para Wallet
 * 
 * POST /api/{tenant}/loyalty/wallet/generate
 * 
 * Genera:
 * - JWT para Google Wallet (botón "Add to Google Wallet")
 * - Archivo .pkpass para Apple Wallet (descarga directa)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { 
  generateGoogleWalletJWT, 
  generateAppleWalletPass 
} from '@/lib/walletService'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    // Buscar tenant
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Verificar que el club de fidelización esté habilitado
    if (!tenant.loyalty?.enabled) {
      return NextResponse.json(
        { error: 'Club de fidelización no habilitado' },
        { status: 400 }
      )
    }

    // Verificar que wallet esté habilitado, o auto-habilitar si loyalty está activo
    if (!tenant.wallet?.enabled) {
      // Auto-habilitar wallet con valores por defecto del branding del tenant
      await Tenant.updateOne(
        { _id: tenant._id },
        {
          $set: {
            'wallet.enabled': true,
            'wallet.cardColor': tenant.branding?.primaryColor || '#000000',
            'wallet.labelColor': tenant.branding?.textColor || '#FFFFFF',
            'wallet.logoUrl': tenant.branding?.logoUrl || ''
          }
        }
      )
      // Recargar tenant actualizado
      const updatedTenant = await Tenant.findById(tenant._id).lean()
      if (updatedTenant) {
        Object.assign(tenant, updatedTenant)
      }
    }

    // Autenticación del miembro (token temporal o sesión)
    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')
    
    // Si no hay memberId en query, buscar por sesión autenticada
    let member
    if (memberId) {
      member = await LoyaltyMember.findOne({
        _id: memberId,
        tenantId: tenant._id
      }).lean()
    } else {
      // Buscar por sesión autenticada
      const authError = await requireAuth(request, tenant._id.toString())
      if (authError) return authError
      
      // Aquí necesitaríamos vincular la sesión con un miembro
      // Por ahora, requerimos memberId explícito
      return NextResponse.json(
        { error: 'Se requiere memberId' },
        { status: 400 }
      )
    }

    if (!member) {
      return NextResponse.json(
        { error: 'Miembro no encontrado' },
        { status: 404 }
      )
    }

    // Generar wallet según el tipo solicitado
    const body = await request.json().catch(() => ({}))
    const walletType = body?.type || 'both' // 'google', 'apple', o 'both'

    const result: {
      google?: { jwt: string; objectId: string } | null
      apple?: { downloadUrl: string } | null
    } = {}

    // Google Wallet
    if (walletType === 'google' || walletType === 'both') {
      console.log('[Wallet API] Generando Google Wallet para miembro:', member._id)
      result.google = await generateGoogleWalletJWT(member._id, tenant._id)
      console.log('[Wallet API] Google Wallet generado:', result.google ? 'YES' : 'NO')
    }

    // Apple Wallet
    if (walletType === 'apple' || walletType === 'both') {
      const passBuffer = await generateAppleWalletPass(member._id, tenant._id)
      if (passBuffer) {
        // En producción, guardaríamos el archivo temporalmente y devolveríamos URL
        // Por ahora, devolvemos base64 para descarga directa
        result.apple = {
          downloadUrl: `data:application/vnd.apple.pkpass;base64,${passBuffer.toString('base64')}`
        }
      }
    }

    // Si no se pudo generar ninguno
    if (!result.google && !result.apple) {
      return NextResponse.json(
        { error: 'No se pudo generar la tarjeta digital. Verifica la configuración.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      member: {
        publicId: member.wallet.publicId,
        name: member.name,
        points: member.loyalty.points,
        tier: member.loyalty.tier
      },
      wallets: result
    })

  } catch (error) {
    console.error('[Wallet API] Error:', error)
    return NextResponse.json(
      { error: 'Error al generar tarjeta digital' },
      { status: 500 }
    )
  }
}

/**
 * GET: Descargar directamente el archivo .pkpass para Apple Wallet
 * 
 * GET /api/{tenant}/loyalty/wallet/generate?memberId=xxx&format=apple
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')
    const format = searchParams.get('format') // 'apple' para pkpass

    if (!memberId || format !== 'apple') {
      return NextResponse.json(
        { error: 'Parámetros inválidos' },
        { status: 400 }
      )
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const member = await LoyaltyMember.findOne({
      _id: memberId,
      tenantId: tenant._id
    }).lean()

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    const passBuffer = await generateAppleWalletPass(member._id, tenant._id)

    if (!passBuffer) {
      return NextResponse.json(
        { error: 'Error generando pase' },
        { status: 500 }
      )
    }

    // Devolver como archivo descargable
    return new NextResponse(new Uint8Array(passBuffer), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${member.wallet.publicId}.pkpass"`,
        'Content-Length': passBuffer.length.toString()
      }
    })

  } catch (error) {
    console.error('[Wallet API] Error GET:', error)
    return NextResponse.json(
      { error: 'Error al generar pase' },
      { status: 500 }
    )
  }
}
