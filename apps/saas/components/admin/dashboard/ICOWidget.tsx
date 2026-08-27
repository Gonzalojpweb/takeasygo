'use client'

import { useEffect, useState } from 'react'
import { Activity, Zap, TrendingUp, AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface IcoData {
  icoScore: number
  capacityScore: number
  totalOrders: number
  history: { score: number; week: string }[]
}

function getScoreColor(score: number) {
  if (score >= 91) return 'text-green-500'
  if (score >= 76) return 'text-green-400'
  if (score >= 51) return 'text-amber-500'
  return 'text-red-500'
}

function getScoreBgColor(score: number) {
  if (score >= 91) return 'bg-green-500'
  if (score >= 76) return 'bg-green-400'
  if (score >= 51) return 'bg-amber-500'
  return 'bg-red-500'
}

function getScoreBorderColor(score: number) {
  if (score >= 91) return 'border-green-500'
  if (score >= 76) return 'border-green-400'
  if (score >= 51) return 'border-amber-500'
  return 'border-red-500'
}

function getExplanation(score: number) {
  if (score >= 91) return 'Tu operación está funcionando de manera excelente. Seguí así, estás entre los mejores.'
  if (score >= 76) return 'Tu operación está estable. Estás en buen camino, pero hay margen para pulir algunos detalles.'
  if (score >= 51) return 'Tu operación está en proceso de consolidación. No está mal, pero hay cosas que podemos mejorar para que todo funcione más fluido.'
  return 'Tu operación necesita ajustes importantes. Hay áreas que requieren atención urgente para mejorar la experiencia de tus clientes.'
}

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  return (
    <div className={cn('rounded-full border-6px flex items-center justify-center', getScoreBorderColor(score))} style={{ width: size, height: size }}>
      <span className={cn('text-2xl font-bold', getScoreColor(score))}>{score}</span>
    </div>
  )
}

export function ICOWidget({ tenantSlug, userName, data: initialData }: { tenantSlug: string; userName: string; data?: IcoData }) {
  const [icoData, setIcoData] = useState<IcoData | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (initialData) return

    let cancelled = false

    async function fetchIco() {
      try {
        setLoading(true)
        setError(false)
        const res = await fetch(`/api/${tenantSlug}/admin/dashboard/ico`)
        if (!res.ok) throw new Error('Error fetching ICO data')
        const json = await res.json()
        if (!cancelled) setIcoData(json)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchIco()
    return () => { cancelled = true }
  }, [tenantSlug, initialData])

  if (loading) {
    return (
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-3/4 bg-muted rounded" />
            <div className="h-4 w-1/2 bg-muted rounded" />
            <div className="flex gap-4 mt-4">
              <div className="h-20 w-20 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !icoData) {
    return (
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm">No se pudo cargar la información del ICO.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (icoData.totalOrders < 10) {
    return (
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm">Se necesitan al menos 10 pedidos para calcular tu ICO.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { icoScore, capacityScore, history } = icoData
  const lastEntries = history.slice(-8)
  const trendEntries = history.slice(-2)
  const trendDiff = trendEntries.length === 2 ? trendEntries[1].score - trendEntries[0].score : 0
  const trendDirection = trendDiff > 0 ? 'subió' : trendDiff < 0 ? 'bajó' : 'mantuvo'

  return (
    <Card className="rounded-2xl border shadow-sm overflow-hidden">
      <CardContent className="p-6">
        {/* Greeting */}
        <div className="mb-6">
          <p className="text-sm font-medium text-foreground">
            Hola {userName}, tu restaurante está operando con un nivel de {icoScore}/100
          </p>
          <p className="text-xs text-muted-foreground mt-1">{getExplanation(icoScore)}</p>
        </div>

        <div className="flex gap-6 mb-6">
          {/* Score Ring */}
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={icoScore} />
            <span className="text-xs text-muted-foreground">ICO Score</span>
          </div>

          {/* Component Details */}
          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Capacidad operativa: {capacityScore}%</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', getScoreBgColor(icoScore))}
                  style={{ width: `${capacityScore}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Tu cocina está usando el {capacityScore}% de su capacidad ideal
              </p>
            </div>
          </div>
        </div>

        {/* Trend Sparkline */}
        {history.length >= 2 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tendencia</span>
            </div>
            <div className="flex items-end gap-1 h-10">
              {lastEntries.map((entry) => (
                <div
                  key={entry.week}
                  className={cn('flex-1 rounded-t transition-all', getScoreBgColor(entry.score))}
                  style={{ height: `${(entry.score / 100) * 100}%` }}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Tu tendencia: tu puntaje {trendDirection} {Math.abs(trendDiff)} puntos en las últimas {history.length} semanas
            </p>
          </div>
        )}

        {/* Zone Indicator */}
        <div className="mb-6">
          <div className="flex gap-2">
            <div className={cn(
              'flex-1 text-center py-1 rounded text-xs font-medium',
              icoScore <= 50 ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-red-50 text-red-400'
            )}>
              0-50
            </div>
            <div className={cn(
              'flex-1 text-center py-1 rounded text-xs font-medium',
              icoScore >= 51 && icoScore <= 75 ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500' : 'bg-amber-50 text-amber-400'
            )}>
              51-75
            </div>
            <div className={cn(
              'flex-1 text-center py-1 rounded text-xs font-medium',
              icoScore >= 76 && icoScore <= 90 ? 'bg-green-100 text-green-700 ring-2 ring-green-400' : 'bg-green-50 text-green-400'
            )}>
              76-90
            </div>
            <div className={cn(
              'flex-1 text-center py-1 rounded text-xs font-medium',
              icoScore >= 91 ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-green-50 text-green-400'
            )}>
              91-100
            </div>
          </div>
        </div>

        {/* Link */}
        <Link
          href={`/${tenantSlug}/admin/ico`}
          className="flex items-center justify-between p-3 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">¿Cómo mejorar mi ICO?</span>
          </div>
          <ChevronRight className="h-4 w-4 text-primary" />
        </Link>
      </CardContent>
    </Card>
  )
}
