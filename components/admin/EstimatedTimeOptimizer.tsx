'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Clock, 
  Calculator, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  History,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimeCalculation {
  estimatedMinutes: number
  muTPP: number
  sigmaTPP: number
  sampleSize: number
  confidenceMargin: number
  confidenceLevel: 'low' | 'medium' | 'high'
  method: 'auto_optimized' | 'default_fallback' | 'manual_override_blocked'
  calculatedAt: string
  icoScoreAtCalc: number | null
}

interface AdjustmentLog {
  previousValue: number
  newValue: number
  reason: string
  icoScore: number | null
  sampleSize: number
  triggeredBy: string
  timestamp: string
}

interface EstimatedTimeOptimizerProps {
  tenantSlug: string
  locationId: string
  locationName: string
  currentValue: number
}

export default function EstimatedTimeOptimizer({
  tenantSlug,
  locationId,
  locationName,
  currentValue
}: EstimatedTimeOptimizerProps) {
  const [calculation, setCalculation] = useState<TimeCalculation | null>(null)
  const [history, setHistory] = useState<AdjustmentLog[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [gamingWarning, setGamingWarning] = useState<string | null>(null)

  const fetchCalculation = useCallback(async () => {
    setLoading(true)
    setError(null)
    setGamingWarning(null)
    
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}/estimated-time`)
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al calcular')
      }
      
      setCalculation(data.calculated)
      if (data.gamingWarning) {
        setGamingWarning(data.gamingWarning)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, locationId])

  const applyAdjustment = async () => {
    if (!calculation || calculation.method === 'default_fallback') return
    
    setApplying(true)
    setError(null)
    setSuccess(null)
    
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}/estimated-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Error al aplicar')
      }
      
      setSuccess(data.message)
      if (data.recentHistory) {
        setHistory(data.recentHistory)
      }
      
      // Refrescar cálculo
      await fetchCalculation()
    } catch (err) {
      setError(String(err))
    } finally {
      setApplying(false)
    }
  }

  const getConfidenceBadge = (level: TimeCalculation['confidenceLevel']) => {
    switch (level) {
      case 'high':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Alta confianza (CLT)</Badge>
      case 'medium':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-300">Confianza media</Badge>
      case 'low':
        return <Badge className="bg-red-100 text-red-700 border-red-300">Datos insuficientes</Badge>
    }
  }

  const diff = calculation ? calculation.estimatedMinutes - currentValue : 0
  const diffPercent = currentValue > 0 ? (Math.abs(diff) / currentValue) * 100 : 0
  const showDiffWarning = diffPercent > 20

  return (
    <Card className="border-2 border-border/60 shadow-lg rounded-3xl overflow-hidden">
      <CardHeader className="border-b border-border/40 bg-muted/30 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Calculator size={20} className="text-primary" />
            </div>
            <div>
              <CardTitle className="text-foreground text-base font-bold">
                Optimizador de Tiempo Estimado
              </CardTitle>
              <p className="text-muted-foreground text-xs mt-0.5">
                Anti-gaming · Basado en ICO · {locationName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">Protegido</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Estado actual */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50">
          <div className="flex items-center gap-3">
            <Clock size={18} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Tiempo actual configurado</span>
          </div>
          <span className="text-2xl font-black tabular-nums">{currentValue} <span className="text-sm font-normal text-muted-foreground">min</span></span>
        </div>

        {/* Botón calcular */}
        <Button
          onClick={fetchCalculation}
          disabled={loading}
          variant="outline"
          className="w-full rounded-2xl h-12"
        >
          {loading ? (
            <RefreshCw size={18} className="animate-spin mr-2" />
          ) : (
            <Calculator size={18} className="mr-2" />
          )}
          {loading ? 'Calculando...' : 'Calcular tiempo óptimo'}
        </Button>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="rounded-2xl border-2">
            <AlertTriangle size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Gaming Warning */}
        {gamingWarning && (
          <Alert className="rounded-2xl border-2 border-amber-500/30 bg-amber-50/50">
            <AlertTriangle size={16} className="text-amber-600" />
            <AlertDescription className="text-amber-700">{gamingWarning}</AlertDescription>
          </Alert>
        )}

        {/* Resultado del cálculo */}
        {calculation && calculation.method !== 'default_fallback' && (
          <div className="space-y-4">
            <div className={cn(
              "p-5 rounded-2xl border-2",
              diff > 0 ? "border-amber-500/30 bg-amber-50/30" : 
              diff < 0 ? "border-emerald-500/30 bg-emerald-50/30" :
              "border-border/60 bg-muted/30"
            )}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Tiempo calculado óptimo</span>
                {getConfidenceBadge(calculation.confidenceLevel)}
              </div>
              
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-black tabular-nums">{calculation.estimatedMinutes}</span>
                <span className="text-lg text-muted-foreground">min</span>
                {diff !== 0 && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "ml-2",
                      diff > 0 ? "border-amber-400 text-amber-700" : "border-emerald-400 text-emerald-700"
                    )}
                  >
                    {diff > 0 ? '+' : ''}{diff} min
                  </Badge>
                )}
              </div>

              {/* Advertencia de diferencia grande */}
              {showDiffWarning && (
                <Alert className="rounded-xl border-amber-500/30 bg-amber-100/50 mb-4">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <AlertDescription className="text-xs text-amber-700">
                    La diferencia es mayor al 20%. {diff > 0 
                      ? 'El tiempo actual podría estar subestimado, causando incumplimientos.' 
                      : 'El tiempo actual podría estar sobreestimado, afectando competitividad.'}
                  </AlertDescription>
                </Alert>
              )}

              {/* Detalles estadísticos */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-white/50">
                  <div className="text-muted-foreground text-xs mb-1">Tiempo promedio real (μ)</div>
                  <div className="font-bold text-lg">{calculation.muTPP} min</div>
                </div>
                <div className="p-3 rounded-xl bg-white/50">
                  <div className="text-muted-foreground text-xs mb-1">Desviación estándar (σ)</div>
                  <div className="font-bold text-lg">{calculation.sigmaTPP} min</div>
                </div>
                <div className="p-3 rounded-xl bg-white/50">
                  <div className="text-muted-foreground text-xs mb-1">Margen de confianza</div>
                  <div className="font-bold text-lg">+{calculation.confidenceMargin} min</div>
                </div>
                <div className="p-3 rounded-xl bg-white/50">
                  <div className="text-muted-foreground text-xs mb-1">Muestra (pedidos)</div>
                  <div className="font-bold text-lg">{calculation.sampleSize}</div>
                </div>
              </div>

              {calculation.icoScoreAtCalc !== null && (
                <div className="mt-4 p-3 rounded-xl bg-white/50 flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">ICO al momento del cálculo</span>
                  <Badge variant="outline" className="font-bold">{calculation.icoScoreAtCalc}</Badge>
                </div>
              )}
            </div>

            {/* Botón aplicar */}
            <Button
              onClick={applyAdjustment}
              disabled={applying || diff === 0}
              className="w-full rounded-2xl h-12"
            >
              {applying ? (
                <RefreshCw size={18} className="animate-spin mr-2" />
              ) : (
                <TrendingUp size={18} className="mr-2" />
              )}
              {applying 
                ? 'Aplicando...' 
                : diff === 0 
                  ? 'Ya está optimizado'
                  : `Ajustar a ${calculation.estimatedMinutes} minutos`
              }
            </Button>

            {/* Success message */}
            {success && (
              <Alert className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/50">
                <CheckCircle size={16} className="text-emerald-600" />
                <AlertDescription className="text-emerald-700">{success}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Sin datos suficientes */}
        {calculation?.method === 'default_fallback' && (
          <Alert className="rounded-2xl border-2 border-amber-500/30 bg-amber-50/50">
            <History size={16} className="text-amber-600" />
            <AlertDescription className="text-amber-700">
              Se requieren al menos <strong>10 pedidos completados</strong> para calcular el tiempo óptimo. 
              Actualmente hay <strong>{calculation.sampleSize}</strong> pedidos con timestamps válidos.
              <br /><br />
              <span className="text-xs">
                El tiempo estimado actual se mantiene en {currentValue} minutos.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Historial de ajustes */}
        {history.length > 0 && (
          <div className="border-t border-border/40 pt-4">
            <h4 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
              <History size={14} />
              Últimos ajustes
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {history.map((log, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-muted/30 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{log.previousValue}→{log.newValue}min</span>
                    {log.icoScore !== null && (
                      <Badge variant="outline" className="text-[10px]">ICO: {log.icoScore}</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info anti-gaming */}
        <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-200/50">
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-violet-600 mt-0.5 shrink-0" />
            <div className="text-xs text-violet-700 space-y-1">
              <p className="font-bold">Protección Anti-Gaming activa</p>
              <p>Este sistema calcula el tiempo basado exclusivamente en timestamps automáticos de pedidos completados. No se puede manipular configurando manualmente valores extremos.</p>
              <ul className="list-disc list-inside mt-2 space-y-0.5 text-violet-600">
                <li>μ_TPP = tiempo promedio real de preparación</li>
                <li>σ_TPP = desviación estándar (variabilidad)</li>
                <li>Margen de confianza = cubre variabilidad inherente</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
