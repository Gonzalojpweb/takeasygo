import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await connectDB()
    const tenants = await Tenant.find()
    return NextResponse.json({ tenants })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await connectDB()
    const body = await request.json()
    const tenant = await Tenant.create(body)
    return NextResponse.json({ tenant }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
