import { connectDB } from '@/lib/mongoose'
import Lead from '@/models/Lead'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { name, business, email, phone, plan, planId } = body

        // Basic field validation
        if (!name || !business || !email || !phone || !plan || !planId) {
            return NextResponse.json(
                { error: 'Todos los campos son requeridos.' },
                { status: 400 }
            )
        }

        // Basic email format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'El email no es válido.' },
                { status: 400 }
            )
        }

        await connectDB()
        const lead = await Lead.create({ name, business, email, phone, plan, planId })

        return NextResponse.json({ lead }, { status: 201 })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
