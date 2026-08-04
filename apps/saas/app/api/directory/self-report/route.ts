import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import { escapeRegex } from '@takeasygo/business'

export async function POST(req: NextRequest) {
  try {
    const { name, address, phone, cuisineTypes, openingHours } = await req.json()

    if (!name?.trim() || !address?.trim()) {
      return NextResponse.json(
        { error: 'Nombre y dirección son obligatorios.' },
        { status: 400 }
      )
    }

    await connectDB()

    // Evitar duplicados por nombre + dirección
    const exists = await RestaurantDirectory.findOne({
      name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
      address: { $regex: escapeRegex(address.trim().slice(0, 20)), $options: 'i' },
    })

    if (exists) {
      return NextResponse.json(
        { error: 'Ya existe un registro con ese nombre y dirección.' },
        { status: 409 }
      )
    }

    await RestaurantDirectory.create({
      name:             name.trim(),
      address:          address.trim(),
      phone:            phone?.trim() || '',
      cuisineTypes:     Array.isArray(cuisineTypes) ? cuisineTypes : [],
      openingHours:     openingHours?.trim() || '',
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[self-report]', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
