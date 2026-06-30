'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, CheckCircle, Clock, User, Package, QrCode, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface RedemptionData {
  _id: string
  redemptionCode: string
  status: 'pending' | 'claimed' | 'expired' | 'cancelled'
  pointsUsed: number
  expiresAt: string
  createdAt: string
  memberId: {
    _id: string
    name: string
    email?: string
  }
  storeItemId: {
    _id: string
    name: string
    imageUrl: string
  }
}

interface Props {
  tenantSlug: string
}

export default function RedemptionValidator({ tenantSlug }: Props) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [redemption, setRedemption] = useState<RedemptionData | null>(null)
  const [claiming, setClaiming] = useState(false)

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setRedemption(null)
    try {
      // Usamos el endpoint de listado con filtro por código
      // Nota: El endpoint GET /api/{tenant}/store/redemptions actualmente pide memberId.
      // Vamos a asumir que podemos buscar por código globalmente o necesitamos un endpoint nuevo.
      // Revisando app/api/[tenant]/store/redemptions/route.ts, el GET requiere memberId.
      // Recomiendo crear un endpoint de búsqueda por código para Admin.
      
      const res = await fetch(`/api/${tenantSlug}/store/redemptions/search?code=${code.trim()}`)
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || 'No se encontró el canje')
      
      setRedemption(data.redemption)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim() {
    if (!redemption) return

    setClaiming(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/store/redemptions/${redemption._id}/claim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemptionCode: code.trim() }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Error al validar canje')

      toast.success('¡Canje validado y entregado con éxito!')
      setRedemption({ ...redemption, status: 'claimed' })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden mb-8">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <QrCode size={24} strokeWidth={2.5} />
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Validar Canje</CardTitle>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Escanea el QR o ingresa el código del cliente
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="TGO-XXXX-XXXX"
              className="pl-12 h-14 rounded-2xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 text-lg font-mono tracking-widest"
            />
          </div>
          <Button 
            type="submit" 
            disabled={loading || !code.trim()}
            className="h-14 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-widest shadow-lg shadow-primary/20"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </Button>
        </form>

        {redemption && (
          <div className="bg-muted/30 rounded-[2rem] border-2 border-border/40 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Product Info */}
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2 border-white shadow-sm">
                      <img 
                        src={redemption.storeItemId.imageUrl} 
                        alt={redemption.storeItemId.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <Badge variant="outline" className="mb-1 uppercase tracking-wider text-[10px] font-bold">
                        Artículo a entregar
                      </Badge>
                      <h3 className="text-2xl font-black leading-none">{redemption.storeItemId.name}</h3>
                      <p className="text-emerald-600 font-bold mt-1">{redemption.pointsUsed} Puntos</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <User size={18} className="text-muted-foreground" />
                      <span className="font-medium">Cliente:</span>
                      <span className="font-bold">{redemption.memberId.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Clock size={18} className="text-muted-foreground" />
                      <span className="font-medium">Canjeado:</span>
                      <span>{format(new Date(redemption.createdAt), "d 'de' MMMM, HH:mm", { locale: es })}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <AlertCircle size={18} className="text-muted-foreground" />
                      <span className="font-medium">Expira:</span>
                      <span className={new Date(redemption.expiresAt) < new Date() ? 'text-red-500 font-bold' : 'text-amber-600 font-bold'}>
                        {format(new Date(redemption.expiresAt), "d 'de' MMMM, HH:mm", { locale: es })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status and Action */}
                <div className="flex flex-col justify-center items-center text-center p-6 bg-white/50 rounded-3xl border border-white/60">
                  <div className="mb-4">
                    <span className="text-xs font-bold uppercase text-muted-foreground block mb-2">Estado del Canje</span>
                    {redemption.status === 'pending' && (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 px-4 py-1 text-sm font-bold">
                        PENDIENTE DE ENTREGA
                      </Badge>
                    )}
                    {redemption.status === 'claimed' && (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 px-4 py-1 text-sm font-bold">
                        YA ENTREGADO
                      </Badge>
                    )}
                    {redemption.status === 'expired' && (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 px-4 py-1 text-sm font-bold">
                        EXPIRADO
                      </Badge>
                    )}
                  </div>

                  {redemption.status === 'pending' && (
                    <Button
                      onClick={handleClaim}
                      disabled={claiming || new Date(redemption.expiresAt) < new Date()}
                      className="w-full h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg uppercase tracking-tighter shadow-xl shadow-emerald-200 transition-all active:scale-95"
                    >
                      {claiming ? (
                        'Procesando...'
                      ) : (
                        <>
                          <CheckCircle className="mr-2" size={24} />
                          Confirmar Entrega
                        </>
                      )}
                    </Button>
                  )}

                  {redemption.status === 'claimed' && (
                    <div className="text-emerald-600 font-bold flex items-center gap-2">
                      <CheckCircle size={20} />
                      Este artículo ya fue retirado
                    </div>
                  )}

                  {redemption.status === 'expired' && (
                    <div className="text-red-600 font-bold">
                      Este canje ha expirado y no puede ser entregado
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!redemption && !loading && (
          <div className="text-center py-12 border-2 border-dashed border-border/40 rounded-[2rem]">
            <Search size={48} className="mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground font-medium">Ingresa un código para ver los detalles del canje</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
