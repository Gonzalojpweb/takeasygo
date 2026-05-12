import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'

/**
 * GET /api/user/addresses
 * Obtiene las direcciones guardadas del usuario autenticado.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    await connectDB()
    const user = await User.findOne({ email: session.user.email }).select('savedAddresses').lean()

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ addresses: user.savedAddresses || [] })
  } catch (error) {
    console.error('[GET /api/user/addresses]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

/**
 * POST /api/user/addresses
 * Agrega una nueva dirección guardada.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { label, address, city, coordinates, isDefault } = body

    if (!label || !address || !coordinates?.lat || !coordinates?.lng) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    await connectDB()
    const user = await User.findOne({ email: session.user.email })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Si es la primera o se marca como default, quitar default a las demás
    if (isDefault || !user.savedAddresses || user.savedAddresses.length === 0) {
      user.savedAddresses?.forEach((addr: any) => { addr.isDefault = false })
    }

    const newAddress = {
      label,
      address,
      city,
      coordinates,
      isDefault: isDefault || !user.savedAddresses || user.savedAddresses.length === 0
    }

    if (!user.savedAddresses) user.savedAddresses = []
    user.savedAddresses.push(newAddress)

    await user.save()

    return NextResponse.json({ addresses: user.savedAddresses }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/user/addresses]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

/**
 * DELETE /api/user/addresses
 * Elimina una dirección por su índice o ID (si existiera). 
 * Para simplicidad usaremos el label como identificador único por ahora o el índice.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const index = parseInt(searchParams.get('index') || '-1')

    if (index === -1) {
      return NextResponse.json({ error: 'Índice no válido' }, { status: 400 })
    }

    await connectDB()
    const user = await User.findOne({ email: session.user.email })

    if (!user || !user.savedAddresses) {
      return NextResponse.json({ error: 'Usuario o direcciones no encontrados' }, { status: 404 })
    }

    const removedWasDefault = user.savedAddresses[index]?.isDefault
    user.savedAddresses.splice(index, 1)

    // Si borramos la default y quedan otras, marcar la primera como default
    if (removedWasDefault && user.savedAddresses.length > 0) {
      user.savedAddresses[0].isDefault = true
    }

    await user.save()

    return NextResponse.json({ addresses: user.savedAddresses })
  } catch (error) {
    console.error('[DELETE /api/user/addresses]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
