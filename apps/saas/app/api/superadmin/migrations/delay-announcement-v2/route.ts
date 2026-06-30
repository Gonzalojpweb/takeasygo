import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Migración: convierte delayAnnouncement plano (v1) → per-mode (v2)
 *
 * v1: { enabled, extraMinutes, message, updatedAt }
 * v2: { takeaway?: {...}, delivery?: {...}, 'dine-in'?: {...}, business?: {...} }
 *
 * Se asigna el valor plano a takeaway (modo por defecto del motor anti-gaming).
 * Solo se ejecuta si el campo existe y está en formato plano (tiene 'enabled').
 */
export async function POST(_request: NextRequest) {
  try {
    await connectDB()

    const locations = await Location.find({
      'settings.delayAnnouncement': { $exists: true },
    }).lean<any[]>()

    let converted = 0
    let skipped = 0

    for (const loc of locations) {
      const da = loc.settings?.delayAnnouncement
      if (!da) { skipped++; continue }

      // Si ya está en formato v2 (tiene clave 'takeaway'), skip
      if (da.takeaway !== undefined || da.delivery !== undefined) {
        skipped++
        continue
      }

      // Si está en formato v1 plano (tiene 'enabled'), convertir
      if (typeof da.enabled === 'boolean') {
        const supportedModes = loc.settings?.orderModes ?? ['takeaway']

        const v2: Record<string, any> = {}
        for (const mode of supportedModes) {
          v2[mode] = {
            enabled: da.enabled,
            extraMinutes: da.extraMinutes ?? 0,
            message: da.message ?? '',
            updatedAt: da.updatedAt ?? null,
          }
        }

        await Location.updateOne(
          { _id: loc._id },
          { $set: { 'settings.delayAnnouncement': v2 } }
        )
        converted++
      } else {
        skipped++
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Migración completada: ${converted} convertidos, ${skipped} ignorados`,
      converted,
      skipped,
    })
  } catch (error) {
    console.error('[Migration delay-announcement-v2] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
