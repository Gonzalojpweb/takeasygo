import { connectDB } from '@/lib/mongoose'
import Lead from '@/models/Lead'
import { rateLimit } from '@/lib/rateLimit'
import { createLeadSchema } from '@/lib/schemas'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        const { success } = await rateLimit(`lead:${ip}`, 10, 60_000)
        if (!success) {
            return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
        }

        const parsed = createLeadSchema.safeParse(await request.json())
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            )
        }

        await connectDB()
        const lead = await Lead.create(parsed.data)

        return NextResponse.json({ lead }, { status: 201 })
    } catch (error) {
        return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 })
    }
}
