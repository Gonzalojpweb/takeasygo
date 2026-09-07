import { NextResponse, type NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  try {
    const { locationId } = await params

    if (!mongoose.isValidObjectId(locationId)) {
      return NextResponse.json(
        { error: 'Invalid locationId' },
        { status: 400 }
      )
    }

    await connectDB()

    const location = await Location.findById(locationId)
      .select('gallery hero')
      .lean() as { gallery?: string[]; hero?: { url?: string } } | null

    if (!location) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      )
    }

    const images = (location.gallery || []).filter(Boolean).slice(0, 8)

    return NextResponse.json({
      locationId,
      images,
      count: images.length,
    })
  } catch (err) {
    console.error('[gallery] error', err)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}
