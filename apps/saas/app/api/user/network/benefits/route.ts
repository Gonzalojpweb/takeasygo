import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { listConsumerBenefits } from '@/lib/network/engine'
import { benefitErrorResponse, consumerUserId } from '@/lib/network/consumer-http'

// GET — beneficios de la red en la cuenta del consumidor (cuenta con email verificado).
export async function GET() {
  try {
    await connectDB()
    return NextResponse.json({ benefits: await listConsumerBenefits((await consumerUserId()) ?? '') })
  } catch (err) {
    return benefitErrorResponse(err, 'list')
  }
}
