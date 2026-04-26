'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  QrCode, 
  Search, 
  User, 
  Star, 
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Minus
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface MemberData {
  id: string
  name: string
  phone?: string
  email?: string
  publicId: string
  points: number
  tier: string
  totalOrders: number
  totalSpent: number
  lastOrderAt?: string
}

interface MemberScannerProps {
  tenantSlug: string
}

type ScanState = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

export default function MemberScanner({ tenantSlug }: MemberScannerProps) {
  const [publicId, setPublicId] = useState('')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [member, setMember] = useState<MemberData | null>(null)
  const [error, setError] = useState('')
  
  // Acciones
  const [pointsToAdd, setPointsToAdd] = useState('')
  const [orderTotal, setOrderTotal] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Buscar miembro por publicId
  const searchMember = async () => {
    if (!publicId.trim()) return

    setScanState('loading')
    setError('')
    setMember(null)
    setActionSuccess(null)

    try {
      const res = await fetch(
        `/api/${tenantSlug}/loyalty/wallet/verify?publicId=${encodeURIComponent(publicId.trim())}`
      )

      const data = await res.json()

      if (!res.ok || !data.valid) {
        setScanState('not_found')
        setError(data.error || 'Miembro no encontrado')
        return
      }

      // Si es válido, obtener info completa con POST
      const fullRes = await fetch(`/api/${tenantSlug}/loyalty/wallet/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: publicId.trim(), action: 'verify' })
      })

      const fullData = await fullRes.json()

      if (!fullRes.ok) {
        setScanState('error')
        setError(fullData.error || 'Error al verificar')
        return
      }

      setMember(fullData.member)
      setScanState('found')

    } catch (err) {
      setScanState('error')
      setError('Error de conexión')
    }
  }

  // Acumular puntos
  const earnPoints = async () => {
    if (!member || (!pointsToAdd && !orderTotal)) return

    setActionLoading(true)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/wallet/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicId: member.publicId,
          action: 'earn',
          pointsToAdd: pointsToAdd ? parseInt(pointsToAdd) : undefined,
          orderTotal: orderTotal ? parseFloat(orderTotal) : undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error')
      }

      // Actualizar miembro local
      setMember(prev => prev ? {
        ...prev,
        points: data.newTotal
      } : null)

      setActionSuccess(`+${data.earnedPoints} puntos agregados`)
      setPointsToAdd('')
      setOrderTotal('')

    } catch (err: any) {
      setError(err.message || 'Error al acumular puntos')
    } finally {
      setActionLoading(false)
    }
  }

  // Canjear puntos
  const redeemPoints = async () => {
    if (!member || !pointsToAdd) return

    setActionLoading(true)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/wallet/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicId: member.publicId,
          action: 'redeem',
          pointsToAdd: parseInt(pointsToAdd)
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error')
      }

      setMember(prev => prev ? {
        ...prev,
        points: data.newTotal
      } : null)

      setActionSuccess(`${data.redeemedPoints} puntos canjeados`)
      setPointsToAdd('')

    } catch (err: any) {
      setError(err.message || 'Error al canjear puntos')
    } finally {
      setActionLoading(false)
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'gold': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'silver': return 'bg-slate-100 text-slate-800 border-slate-200'
      case 'bronze': return 'bg-orange-100 text-orange-800 border-orange-200'
      default: return 'bg-zinc-100 text-zinc-800 border-zinc-200'
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Buscador */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <QrCode size={20} />
            Escanear Tarjeta de Miembro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ingresa el código (ej: TGO-A3F7-K9M2-P8R5)"
              value={publicId}
              onChange={(e) => setPublicId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchMember()}
              className="flex-1 font-mono text-sm"
            />
            <Button 
              onClick={searchMember}
              disabled={scanState === 'loading' || !publicId.trim()}
            >
              {scanState === 'loading' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Search size={18} />
              )}
            </Button>
          </div>

          {/* Estados */}
          {scanState === 'not_found' && (
            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
              <XCircle size={20} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error || 'Miembro no encontrado'}</p>
            </div>
          )}

          {scanState === 'error' && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <XCircle size={20} className="text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">{error || 'Error al verificar'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info del Miembro */}
      {member && scanState === 'found' && (
        <Card className="border-2 border-emerald-100">
          <CardContent className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold">{member.name}</h3>
                <p className="text-sm text-zinc-500 font-mono">{member.publicId}</p>
              </div>
              <Badge variant="outline" className={getTierColor(member.tier)}>
                {member.tier === 'none' ? 'Miembro' : member.tier}
              </Badge>
            </div>

            {/* Puntos */}
            <div className="bg-zinc-50 rounded-xl p-4 text-center">
              <p className="text-4xl font-black text-zinc-900">{member.points}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Puntos disponibles</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-zinc-50 rounded-lg">
                <p className="text-zinc-500 text-xs">Pedidos totales</p>
                <p className="font-semibold">{member.totalOrders}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded-lg">
                <p className="text-zinc-500 text-xs">Total gastado</p>
                <p className="font-semibold">${member.totalSpent?.toFixed(2) || '0.00'}</p>
              </div>
            </div>

            {member.lastOrderAt && (
              <p className="text-xs text-zinc-400 flex items-center gap-1">
                <History size={12} />
                Último pedido: {new Date(member.lastOrderAt).toLocaleDateString()}
              </p>
            )}

            <hr className="border-zinc-100" />

            {/* Acciones */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-700">Acciones</p>

              {/* Acumular puntos */}
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Monto de compra $"
                  value={orderTotal}
                  onChange={(e) => setOrderTotal(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={earnPoints}
                  disabled={actionLoading || (!pointsToAdd && !orderTotal)}
                  variant="default"
                  className="shrink-0"
                >
                  {actionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} className="mr-1" />
                  )}
                  Acumular
                </Button>
              </div>

              {/* Canjear puntos */}
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Puntos a canjear"
                  value={pointsToAdd}
                  onChange={(e) => setPointsToAdd(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={redeemPoints}
                  disabled={actionLoading || !pointsToAdd}
                  variant="outline"
                  className="shrink-0"
                >
                  {actionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Minus size={16} className="mr-1" />
                  )}
                  Canjear
                </Button>
              </div>

              {actionSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <p className="text-sm text-emerald-700">{actionSuccess}</p>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                  <XCircle size={16} className="text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
