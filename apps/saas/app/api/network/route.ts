import { connectDB } from '@/lib/mongoose'
import NetworkRestaurant from '@/models/NetworkRestaurant'
import { rateLimit } from '@/lib/rateLimit'
import { createNetworkSchema } from '@/lib/schemas'
import { encrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        const { success } = await rateLimit(`network:${ip}`, 10, 60_000)
        if (!success) {
            return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
        }

        const parsed = createNetworkSchema.safeParse(await request.json())
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            )
        }

        await connectDB()
        const { nombre, email, telefono, ...rest } = parsed.data
        await NetworkRestaurant.create({
            ...rest,
            nombre:   encrypt(nombre),
            email:    encrypt(email),
            telefono: encrypt(telefono),
        })

        return NextResponse.json({ ok: true }, { status: 201 })
    } catch (error) {
        return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 })
    }
}
