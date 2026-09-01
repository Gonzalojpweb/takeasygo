import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { NextRequest, NextResponse } from 'next/server'
import { hashPhone } from '@/lib/crypto'
import { upsertConsumerFromOrder } from '@/lib/consumer'
import { corporateHasAccess, getTenantPaymentConfig } from '@/lib/corporateAccess'
import crypto from 'crypto'

// Only company admin email can start a group session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const { email, locationId, corporateAccountId } = body

    if (!email || !locationId || !corporateAccountId) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Validate location belongs to tenant
    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true }).lean()
    if (!location) {
      return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    }

    // Validate corporate account with multi-tenant access
    const corpAccount = await CorporateAccount.findOne({
      _id: corporateAccountId,
      status: 'active',
    }).lean()
    if (!corpAccount) {
      return NextResponse.json({ error: 'Cuenta corporativa no encontrada o suspendida' }, { status: 403 })
    }

    if (!corporateHasAccess(corpAccount, tenant._id)) {
      return NextResponse.json({ error: 'Cuenta corporativa no tiene acceso a este tenant' }, { status: 403 })
    }

    // Only the company admin email can start a group session
    if (corpAccount.companyAdminEmail.toLowerCase().trim() !== normalizedEmail) {
      return NextResponse.json({ error: 'Solo el email corporativo puede abrir un pedido grupal' }, { status: 403 })
    }

    // Check for existing open session for this account
    const existingOpen = await Order.findOne({
      tenantId: tenant._id,
      deletedAt: null,
      corporateAccountId: corpAccount._id,
      status: 'open',
      sessionExpiresAt: { $gt: new Date() },
    }).lean()
    if (existingOpen) {
      return NextResponse.json({
        error: 'Ya hay una sesión grupal activa para esta empresa',
        token: existingOpen.groupSessionToken,
        sessionExpiresAt: existingOpen.sessionExpiresAt,
      }, { status: 409 })
    }

    // Generate unique token
    const token = crypto.randomBytes(24).toString('hex')
    const sessionDurationMinutes = 45
    const expiresAt = new Date(Date.now() + sessionDurationMinutes * 60 * 1000)

    // Validate menu exists
    const menu = await Menu.findOne({ tenantId: tenant._id, locationId, isActive: true }).lean()
    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado para esta sede' }, { status: 404 })
    }

    // Get payment config for this tenant
    const paymentConfig = getTenantPaymentConfig(corpAccount, tenant._id)

    const order = await Order.create({
      tenantId: tenant._id,
      locationId,
      orderNumber: `GRP-${Date.now().toString(36).toUpperCase()}-${token.slice(0, 4).toUpperCase()}`,
      status: 'open',
      orderMode: 'business',
      corporateAccountId: corpAccount._id,
      paymentModeSnapshot: paymentConfig?.paymentMode || 'cash_mp',
      groupSessionToken: token,
      sessionExpiresAt: expiresAt,
      items: [],
      subtotal: 0,
      discountAmount: 0,
      total: 0,
      customer: {
        name: corpAccount.companyName,
        phone: '',
        email: normalizedEmail,
      },
      payment: { status: 'pending', method: 'mercadopago', mercadopagoId: null, mercadopagoData: null },
      rewardItems: [],
      printLog: [],
      statusTimestamps: {
        confirmedAt: null, preparingAt: null, readyAt: null,
        deliveredAt: null, cancelledAt: null, estimatedReadyAt: null,
      },
      posSync: { status: 'not_applicable', posOrderId: null, attempts: 0, lastAttemptAt: null, error: null },
      orderTiming: 'immediate',
      loyaltyPointsCredited: false,
    })

    // Sync consumer registry (never fails the order)
    if (normalizedEmail) {
      try {
        await upsertConsumerFromOrder({
          name: corpAccount.companyName,
          email: normalizedEmail,
          phone: '',
          phoneHash: null,
          tenantId: tenant._id,
          total: 0,
          createdAt: order.createdAt,
          isCorporate: true,
          corporateAccountId: corpAccount._id,
        })
      } catch (e) {
        console.error('[consumer] group-session upsert error:', e)
      }
    }

    const shareLink = `/${tenantSlug}/menu/${locationId}/business/group/${token}`

    return NextResponse.json({
      session: {
        token,
        sessionExpiresAt: expiresAt.toISOString(),
        shareLink,
        orderId: order._id.toString(),
        companyName: corpAccount.companyName,
      }
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
