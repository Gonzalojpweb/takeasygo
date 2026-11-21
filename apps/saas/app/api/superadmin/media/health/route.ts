/**
 * GET /api/superadmin/media/health — diagnóstico de la cuenta ads (CP3).
 *
 * Con las credenciales que tiene ESTE servidor (Vercel): ¿están las
 * variables?, ¿Cloudinary las acepta (ping)?, ¿existen los presets y son
 * firmados? Nunca devuelve secretos: solo largos y estados.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { adsCreds, adsFolderRoot, adsPreset, cloudinarySdk as cloudinary } from '@/lib/cloudinary'

export const dynamic = 'force-dynamic'

const VARS = ['CLOUDINARY_ADS_CLOUD_NAME', 'CLOUDINARY_ADS_API_KEY', 'CLOUDINARY_ADS_API_SECRET', 'CLOUDINARY_ADS_FOLDER_ROOT', 'CLOUDINARY_ADS_IMAGE_PRESET', 'CLOUDINARY_ADS_VIDEO_PRESET']

export async function GET() {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  const vars = Object.fromEntries(VARS.map((v) => {
    const raw = process.env[v]
    return [v, raw === undefined ? 'falta' : { largo: raw.length, conEspaciosOSaltos: raw !== raw.trim() }]
  }))

  let creds
  try { creds = adsCreds() } catch (e) {
    return NextResponse.json({ ok: false, paso: 'variables', error: (e as Error).message, vars })
  }

  const result: Record<string, unknown> = { vars, carpetaRaiz: adsFolderRoot() }
  try {
    const p = await cloudinary.api.ping(creds) as { status?: string }
    result.ping = p.status ?? 'ok'
  } catch (e) {
    const msg = (e as { error?: { message?: string } })?.error?.message || (e as Error).message
    return NextResponse.json({ ok: false, paso: 'credenciales', error: msg, ...result })
  }

  const presets: Record<string, unknown> = {}
  for (const kind of ['image', 'video'] as const) {
    const name = adsPreset(kind)
    try {
      const r = await cloudinary.api.upload_preset(name, creds) as { unsigned?: boolean; settings?: Record<string, unknown> }
      presets[kind] = { nombre: name, firmado: !r.unsigned, formatos: r.settings?.allowed_formats ?? null }
    } catch (e) {
      presets[kind] = { nombre: name, error: (e as { error?: { message?: string } })?.error?.message || (e as Error).message }
    }
  }
  result.presets = presets
  const presetsOk = Object.values(presets).every((p) => (p as { firmado?: boolean }).firmado === true)
  return NextResponse.json({ ok: presetsOk, paso: presetsOk ? 'listo' : 'presets', ...result })
}
