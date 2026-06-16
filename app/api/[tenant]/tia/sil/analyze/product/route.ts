import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { fetchDashboardMetrics } from '@/lib/tia/metrics'
import type { Insight, SilConfig } from '@/lib/tia/types'
import { detectAnomaliesInSeries } from '@/lib/tia/sil/anomaly'
import { analyzeTrend } from '@/lib/tia/sil/trend'

const CONFIG: SilConfig = {
  minSampleSize: 10,
  anomalyStdThreshold: 2,
  trendMinPoints: 5,
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  let body: { productName?: string; days?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.productName) {
    return NextResponse.json({ error: 'productName is required' }, { status: 400 })
  }

  await connectDB()

  const Tenant = (await import('@/models/Tenant')).default
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  try {
    const metrics = await fetchDashboardMetrics(tenant._id.toString())
    const productName = body.productName
    const days = body.days ?? 30

    const insights: Insight[] = []

    // Find product stats from top products
    const productData = metrics.topProducts.mostSold.find(
      p => p.name.toLowerCase() === productName.toLowerCase()
    )

    if (!productData) {
      // Product not found in top sellers — provide info insight
      insights.push({
        type: 'sample_size',
        severity: 'info',
        category: 'products',
        title: `Producto "${productName}" no encontrado`,
        description: `El producto no aparece en el top de más vendidos de los últimos ${days} días. Puede tener pocas ventas o no existir.`,
        metric: `product.${productName}.sold`,
        currentValue: 0,
        sampleSize: 0,
      })

      return NextResponse.json({
        productName,
        insights,
        anomalies: [],
        metadata: {
          totalAnalyzers: 1,
          sampleRejected: 0,
          executionTimeMs: 0,
        },
      })
    }

    // Product-level anomaly: compare against other products
    const soldCounts = metrics.topProducts.mostSold.map(p => p.count)
    const productIndex = metrics.topProducts.mostSold.findIndex(
      p => p.name.toLowerCase() === productName.toLowerCase()
    )

    if (soldCounts.length >= 3) {
      insights.push(...detectAnomaliesInSeries(
        `product.${productName}.sold`,
        'products',
        soldCounts,
        CONFIG,
      ).filter(a => a.currentValue === productData.count))
    }

    // Compare product vs category average
    const category = metrics.sil.categories.find(
      c => c.category.toLowerCase() === productName.toLowerCase()
    )
    if (category && category.totalSold >= CONFIG.minSampleSize) {
      const avgPerProduct = metrics.topProducts.mostSold.length > 0
        ? metrics.topProducts.mostSold.reduce((s, p) => s + p.count, 0) / metrics.topProducts.mostSold.length
        : 0

      if (avgPerProduct > 0 && productData.count > avgPerProduct * 1.5) {
        insights.push({
          type: 'category',
          severity: 'info',
          category: 'products',
          title: `${productName} vende por encima del promedio`,
          description: `${productData.count} unidades vs promedio de ${avgPerProduct.toFixed(0)} por producto.`,
          metric: `product.${productName}.vsAvg`,
          currentValue: productData.count,
          previousValue: Math.round(avgPerProduct),
          changePercent: Math.round(((productData.count - avgPerProduct) / avgPerProduct) * 100),
          sampleSize: metrics.topProducts.mostSold.length,
          recommendation: 'Considerar destacar este producto en el menú.',
        })
      }
    }

    // Revenue-based insight
    if (productData.revenue > 0 && metrics.trends.revenue30d > 0) {
      const revenueShare = (productData.revenue / metrics.trends.revenue30d) * 100
      if (revenueShare > 20) {
        insights.push({
          type: 'distribution',
          severity: 'info',
          category: 'products',
          title: `${productName} concentra el ${revenueShare.toFixed(0)}% de ingresos`,
          description: `Representa $${productData.revenue.toLocaleString('es-AR')} de $${metrics.trends.revenue30d.toLocaleString('es-AR')} totales (30d).`,
          metric: `product.${productName}.revenueShare`,
          currentValue: productData.revenue,
          previousValue: metrics.trends.revenue30d,
          changePercent: Math.round(revenueShare),
          sampleSize: 2,
          recommendation: 'Alta concentración: evaluar riesgo si este producto falta o se retira.',
        })
      }
    }

    return NextResponse.json({
      productName,
      insights,
      anomalies: insights.filter(i => i.type === 'anomaly'),
      metadata: {
        totalAnalyzers: 3,
        sampleRejected: 0,
        executionTimeMs: 0,
      },
    })
  } catch (error) {
    console.error('[SIL Analyze Product]', error)
    return NextResponse.json({ error: 'Error analyzing product' }, { status: 500 })
  }
}
