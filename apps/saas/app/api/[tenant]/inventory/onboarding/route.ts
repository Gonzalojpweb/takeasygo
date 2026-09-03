import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import Location from "@/models/Location"
import {
  inferSKUsFromMenu,
  confirmSKUs,
  ensureDefaultStorageLocations,
} from "@/lib/inventory/cold-start"
import {
  createRecipesBatch,
  getOnboardingStatus,
} from "@/lib/inventory/recipe-inference"

// ============================================================================
// POST /api/[tenant]/inventory/onboarding — Progressive Zero-Setup
// FASE03 §6, Roadmap §6 Etapa 8
//
// Flujo completo de onboarding:
// 1. GET  → inferir SKUs desde menú (Nivel 0)
// 2. POST → confirmar SKUs + crear ubicaciones (Nivel 1)
// 3. POST → declarar recetas mínimas (Nivel 1)
// ============================================================================

// ── GET: Inferir SKUs desde el menú ──────────────────────────────────────────

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
    const action = searchParams.get("action") ?? "infer"

    // ── action=status ──────────────────────────────────────────────────────
    if (action === "status") {
      const status = await getOnboardingStatus(tenant._id.toString())
      return NextResponse.json(status)
    }

    // ── action=infer (default) ─────────────────────────────────────────────
    const result = await inferSKUsFromMenu(tenant._id.toString())

    return NextResponse.json({
      ...result,
      message: `Se analizaron ${result.menuItemsAnalyzed} ítems del menú. Se infirieron ${result.uniqueSKUsInferred} SKUs probables.`,
      nextStep: "Confirma 5-10 SKUs de alto impacto económico haciendo POST a este endpoint",
    })
  } catch (error) {
    console.error("[inventory/onboarding GET]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// ── POST: Confirmar SKUs + crear ubicaciones + declarar recetas ──────────────

export async function POST(
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

    const body = await request.json()
    const results: Record<string, unknown> = {}

    // ── 1. Confirmar SKUs ──────────────────────────────────────────────────
    if (Array.isArray(body.confirmedSKUs) && body.confirmedSKUs.length > 0) {
      const skuResult = await confirmSKUs(
        tenant._id.toString(),
        body.confirmedSKUs
      )
      results.skus = skuResult
    }

    // ── 2. Crear ubicaciones de stock por defecto ───────────────────────────
    if (body.createStorageLocations) {
      // Obtener primera sede del tenant
      const location = await Location.findOne({ tenantId: tenant._id, isActive: true })
      if (location) {
        const locResult = await ensureDefaultStorageLocations(
          tenant._id.toString(),
          location._id.toString()
        )
        results.storageLocations = locResult
      }
    }

    // ── 3. Declarar recetas mínimas ─────────────────────────────────────────
    if (Array.isArray(body.recipes) && body.recipes.length > 0) {
      const recipeResult = await createRecipesBatch(
        tenant._id.toString(),
        body.recipes
      )
      results.recipes = recipeResult
    }

    // ── 4. Obtener estado final ─────────────────────────────────────────────
    const status = await getOnboardingStatus(tenant._id.toString())
    results.status = status

    return NextResponse.json({
      success: true,
      ...results,
      message: getStepMessage(status.level),
    })
  } catch (error) {
    console.error("[inventory/onboarding POST]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

function getStepMessage(level: number): string {
  switch (level) {
    case 0:
      return "Sin configurar. Usá GET para inferir SKUs desde tu menú."
    case 1:
      return "Catálogo básico creado. Declará recetas mínimas para empezar a trackear consumos."
    case 2:
      return "Sistema calibrando. A medida que registres ventas y recepciones, TGO aprenderá equivalencias y ajustará yields."
    case 3:
      return "Sistema en modo operativo. Solo verificá los SKUs que TGO prioriza por EER."
    default:
      return "Proceso de onboarding en curso."
  }
}
