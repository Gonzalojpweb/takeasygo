import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'

// Simple in-memory rate limiter (resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5

function getRateLimitKey(ip: string, email: string): string {
  return `${ip}:${email}`
}

function checkRateLimit(ip: string, email: string): { allowed: boolean; remaining: number; resetAt: number } {
  const key = getRateLimitKey(ip, email)
  const now = Date.now()

  // Clean up expired entries periodically (every ~100 requests)
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitMap) {
      if (v.resetAt < now) rateLimitMap.delete(k)
    }
  }

  const entry = rateLimitMap.get(key)

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - entry.count, resetAt: entry.resetAt }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Rate limiting by IP + email
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'

    const rateCheck = checkRateLimit(ip, normalizedEmail)
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.ceil((rateCheck.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        { error: `Demasiados intentos. Intentá de nuevo en ${retryAfterSeconds} segundos.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (!tenant.business?.enabled) {
      return NextResponse.json({ error: 'Business no habilitado en este tenant' }, { status: 403 })
    }

    const account = await CorporateAccount.findOne({
      tenantId: tenant._id,
      status: 'active',
      $or: [
        { companyAdminEmail: normalizedEmail },
        { employeeEmails: normalizedEmail },
      ],
    }).lean()

    if (!account) {
      return NextResponse.json({ error: 'Email no registrado en ninguna empresa' }, { status: 404 })
    }

    const isCompanyAdmin = account.companyAdminEmail === normalizedEmail

    return NextResponse.json({
      verified: true,
      role: isCompanyAdmin ? 'company_admin' : 'employee',
      corporateAccountId: account._id.toString(),
      corporateAccountEmail: account.companyAdminEmail,
      companyName: account.companyName,
      paymentMode: account.paymentMode,
      isCompanyAdmin,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al verificar email' }, { status: 500 })
  }
}
