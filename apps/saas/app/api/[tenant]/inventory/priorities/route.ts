import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { getDailyPriorities } from "@/lib/inventory"

// ============================================================================
// GET /api/[tenant]/inventory/priorities — Ranking diario de prioridades EER
// FASE04 §3.6, Roadmap §6 Etapa 4
// Retorna 3-8 SKUs con mayor riesgo económico esperado
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const topN = Math.min(parseInt(searchParams.get("top") || "8", 10), 20)

    const priorities = await getDailyPriorities(
      tenant._id.toString(),
      topN,
      new Date()
    )

    return NextResponse.json({
      generatedAt: new Date(),
      tenantId: tenant._id.toString(),
      priorities,
      meta: {
        count: priorities.length,
        maxRequested: topN,
      },
    })
  } catch (error) {
    console.error("[inventory/priorities GET]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
