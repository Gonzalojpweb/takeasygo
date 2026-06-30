import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: 'Slug requerido' }, { status: 400 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id slug name plan branding')

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ tenant })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}