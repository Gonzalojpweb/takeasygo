import { connectDB } from '@/lib/mongoose'
import NetworkRestaurant from '@/models/NetworkRestaurant'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { nombre, instagram, email, telefono, tipoRestaurante } = body

        if (!nombre || !email || !telefono || !tipoRestaurante) {
            return NextResponse.json(
                { error: 'Los campos nombre, email, teléfono y tipo son requeridos.' },
                { status: 400 }
            )
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: 'El email no es válido.' }, { status: 400 })
        }

        await connectDB()
        const restaurant = await NetworkRestaurant.create({
            nombre, instagram: instagram || '', email, telefono, tipoRestaurante,
        })

        return NextResponse.json({ restaurant }, { status: 201 })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
