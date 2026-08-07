'use client'

import { useState, useEffect } from 'react'
import {
  X, ShoppingCart, DollarSign, Calendar, Clock,
  ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown, Minus,
  Target, Zap,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'
import { CustomerSegmentBadge, CustomerHealthScore, CustomerInsights } from '../cis'
import { HealthScoreTrendChart } from '../cis/charts'

// ─────────────────────────────────────────────────────────────────────────────
// ConsumerDetailModal — Perfil V2 del cliente con datos CIS (P1-P9)
// ─────────────────────────────────────────────────────────────────────────────
// Reemplaza la vista básica del CRM con perfil enriquecido.
// Fuente: GET /api/[tenant]/crm/[id]/profile
// Patrón: Replica la estructura de ConsumerDetailModal de superadmin.

interface ConsumerRow {
  _id: string
  name: string
  phone: string
  email: string
}

interface ProfileData {
  // Base
  name: string
  phone: string
  email: string
  isLoyaltyMember: boolean
  isCorporate: boolean
  // Métricas
  metrics: {
    orderCount: number
    totalSpent: number
    avgTicket: number
    lifetimeValue: number
    firstOrderAt: string | null
    lastOrderAt: string | null
    daysSinceLastOrder: number | null
    daysSinceFirstOrder: number | null
    visitFrequency: number | null
    avgOrderInterval: number | null
    favoriteCategories: { category: string; count: number }[]
    favoriteProducts: { product: string; count: number }[]
    favoriteDays: string[]
    favoriteHours: number[]
    uniqueProducts: number
    menuViews: number
    productViews: number
    cartAdds: number
    checkoutStarts: number
    completedOrders: number
    conversionRate: number
    rewardUsageCount: number
    rewardUsageRate: number
    clubJoinDate: string | null
    clubStatus: string | null
    clubPoints: number
  } | null
  // Inteligencia
  segment: string
  signals: string[]
  healthScore: { total: number; components: Record<string, number>; calculatedAt: string | null }
  healthScoreHistory: { date: string; total: number }[]
  healthScoreTrend: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  healthScoreTrendSummary: string | null
  recommendedAction: { type: string; priority: string; description: string } | null
  // Metadatos
  metricsCalculatedAt: string | null
  lastSegmentAt: string | null
}

interface Props {
  consumer: ConsumerRow
  tenantSlug: string
  onClose: () => void
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso))
}

function fmtCurrency(n: number) {
  return `$${toPesos(n).toLocaleString('es-AR')}`
}

const TREND_CONFIG = {
  improving: { icon: TrendingUp, label: 'Mejorando', color: 'text-emerald-500' },
  declining: { icon: TrendingDown, label: 'Bajando', color: 'text-red-500' },
  stable: { icon: Minus, label: 'Estable', color: 'text-muted-foreground' },
  insufficient_data: { icon: Minus, label: 'Sin datos', color: 'text-muted-foreground/50' },
}

export default function ConsumerDetailModal({ consumer, tenantSlug, onClose }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      try {
        const res = await fetch(`/api/${tenantSlug}/crm/${consumer._id}/profile`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        setProfile(data)
      } catch {
        /* silent */
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [consumer._id, tenantSlug])

  const m = profile?.metrics

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          className="w-full max-w-2xl bg-white rounded-3xl max-h-[85dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-zinc-100 p-5 flex items-center justify-between rounded-t-3xl z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                {(consumer.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-bold text-base">{consumer.name || 'Sin nombre'}</h2>
                <p className="text-xs text-muted-foreground">{consumer.email || consumer.phone || 'Sin contacto'}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : !profile ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No se pudieron cargar los datos del perfil
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Segmento + Health Score */}
              <div className="flex items-center gap-3 flex-wrap">
                <CustomerSegmentBadge segment={profile.segment as any} />
                <CustomerHealthScore
                  score={profile.healthScore}
                  trend={profile.healthScoreTrend}
                />
              </div>

              {/* Evolución de Salud (P4) */}
              {profile.healthScoreHistory && profile.healthScoreHistory.length > 0 && (
                <HealthScoreTrendChart
                  data={profile.healthScoreHistory}
                  trend={profile.healthScoreTrend}
                />
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                  <ShoppingCart size={16} className="text-primary mb-1.5" />
                  <p className="text-xl font-bold">{m?.orderCount ?? profile.metrics?.orderCount ?? 0}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Órdenes</p>
                </div>
                <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                  <DollarSign size={16} className="text-primary mb-1.5" />
                  <p className="text-xl font-bold">{fmtCurrency(m?.totalSpent ?? 0)}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Gastado</p>
                </div>
                <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                  <Target size={16} className="text-primary mb-1.5" />
                  <p className="text-xl font-bold">{fmtCurrency(m?.avgTicket ?? 0)}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Ticket Prom.</p>
                </div>
                <div className="p-4 bg-muted/20 rounded-2xl border border-border/40">
                  <Zap size={16} className="text-primary mb-1.5" />
                  <p className="text-xl font-bold">{m?.visitFrequency ? `${m.visitFrequency.toFixed(1)}` : '—'}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground/50 mt-0.5">Visitas/mes</p>
                </div>
              </div>

              {/* Acción recomendada (P9) */}
              {profile.recommendedAction && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className="text-primary" />
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Acción Recomendada</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{profile.recommendedAction.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Prioridad: {profile.recommendedAction.priority} · Tipo: {profile.recommendedAction.type}
                  </p>
                </div>
              )}

              {/* Insights (P2: señales individuales) */}
              <CustomerInsights
                signals={profile.signals}
                favoriteCategories={m?.favoriteCategories}
                favoriteProducts={m?.favoriteProducts}
                daysSinceLastOrder={m?.daysSinceLastOrder}
                avgOrderInterval={m?.avgOrderInterval}
                trendSummary={profile.healthScoreTrendSummary}
              />

              {/* Detalles */}
              <div className="rounded-2xl border border-border p-4 space-y-2">
                <h3 className="text-sm font-bold mb-2">Detalles</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Primera compra:</span>{' '}
                    <span className="font-medium">{fmtDate(m?.firstOrderAt ?? null)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Última compra:</span>{' '}
                    <span className="font-medium">{fmtDate(m?.lastOrderAt ?? null)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Días sin compra:</span>{' '}
                    <span className="font-medium">{m?.daysSinceLastOrder ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Intervalo prom.:</span>{' '}
                    <span className="font-medium">{m?.avgOrderInterval ? `${Math.round(m.avgOrderInterval)} días` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Productos únicos:</span>{' '}
                    <span className="font-medium">{m?.uniqueProducts ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tasa conversión:</span>{' '}
                    <span className="font-medium">{m?.conversionRate ? `${(m.conversionRate * 100).toFixed(0)}%` : '—'}</span>
                  </div>
                  {m?.clubStatus && (
                    <div>
                      <span className="text-muted-foreground">Club:</span>{' '}
                      <span className="font-medium">{m.clubStatus} ({m.clubPoints} pts)</span>
                    </div>
                  )}
                  {m?.rewardUsageCount !== undefined && m.rewardUsageCount > 0 && (
                    <div>
                      <span className="text-muted-foreground">Rewards usados:</span>{' '}
                      <span className="font-medium">{m.rewardUsageCount} ({(m.rewardUsageRate * 100).toFixed(0)}%)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Favoritos */}
              {m && m.favoriteCategories.length > 0 && (
                <div className="rounded-2xl border border-border p-4">
                  <h3 className="text-sm font-bold mb-2">Favoritos</h3>
                  <div className="flex flex-wrap gap-2">
                    {m.favoriteCategories.slice(0, 5).map((cat, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted/40 text-xs font-medium">
                        {cat.category}
                        <span className="ml-1.5 text-muted-foreground">({cat.count})</span>
                      </span>
                    ))}
                  </div>
                  {m.favoriteDays.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Días preferidos: {m.favoriteDays.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Metadatos CIS */}
              {profile.metricsCalculatedAt && (
                <p className="text-[10px] text-muted-foreground/50 text-right">
                  Último cálculo: {fmtDate(profile.metricsCalculatedAt)}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
