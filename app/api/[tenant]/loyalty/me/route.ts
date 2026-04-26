/**
 * GET /api/[tenant]/loyalty/me
 * 
 * Obtiene la membresía del club de fidelización del usuario autenticado.
 * Si el usuario no tiene membresía, devuelve null.
 * 
 * Este endpoint es usado por el perfil del cliente para mostrar sus puntos,
 * nivel y permitir agregar la wallet.
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import User from '@/models/User'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    // Obtener sesión del usuario
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Buscar el usuario
    const user = await User.findOne({ email: session.user.email }).lean()
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Buscar el tenant
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty wallet')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Verificar que el club esté habilitado
    if (!tenant.loyalty?.enabled) {
      return NextResponse.json({ 
        member: null,
        clubEnabled: false,
        walletEnabled: tenant.wallet?.enabled ?? false
      })
    }

    // Buscar membresía del usuario en este tenant
    const member = await LoyaltyMember.findOne({
      userId: user._id,
      tenantId: tenant._id
    }).lean()

    if (!member) {
      return NextResponse.json({
        member: null,
        clubEnabled: true,
        walletEnabled: tenant.wallet?.enabled ?? false,
        message: 'No sos miembro del club de fidelización de este restaurante'
      })
    }

    // Si el miembro está inactivo o bloqueado
    if (member.status !== 'active') {
      return NextResponse.json({
        member: {
          id: member._id.toString(),
          name: member.name,
          status: member.status,
          joinedAt: member.joinedAt
        },
        clubEnabled: true,
        walletEnabled: tenant.wallet?.enabled ?? false,
        message: member.status === 'blocked' ? 'Tu membresía está bloqueada' : 'Tu membresía está inactiva'
      })
    }

    // Devolver datos completos del miembro activo
    return NextResponse.json({
      member: {
        id: member._id.toString(),
        name: member.name,
        phone: member.phone,
        email: member.email,
        status: member.status,
        joinedAt: member.joinedAt,
        points: member.loyalty.points,
        tier: member.loyalty.tier,
        publicId: member.wallet.publicId,
        totalOrders: member.cache.totalOrders,
        totalSpent: member.cache.totalSpent,
        lastOrderAt: member.cache.lastOrderAt
      },
      clubEnabled: true,
      walletEnabled: tenant.wallet?.enabled ?? false,
      clubName: tenant.loyalty.clubName || `Club ${tenant.name}`,
      welcomeMessage: tenant.loyalty.welcomeMessage || ''
    })

  } catch (error) {
    console.error('[loyalty/me] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
