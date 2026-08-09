'use client'

import { useState, use } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QrCode, Search, Loader2, Smartphone, CreditCard } from 'lucide-react'
import { toPesos } from '@takeasygo/business'
import { toast } from 'sonner'
import AddToWalletButtons from '@/components/wallet/AddToWalletButtons'

interface MemberData {
  name: string
  publicId: string
  points: number
  tier: string
  totalOrders: number
  totalSpent: number
  joinedAt: string
}

interface ClubData {
  name: string
  welcomeMessage: string
}

interface WalletData {
  enabled: boolean
  cardColor: string
  labelColor: string
  logoUrl: string
}

export default function ClubLookupPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = use(params)
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [member, setMember] = useState<MemberData | null>(null)
  const [club, setClub] = useState<ClubData | null>(null)
  const [wallet, setWallet] = useState<WalletData | null>(null)

  const handleSearch = async () => {
    if (!searchInput.trim()) {
      toast.error('Ingresá tu teléfono o código')
      return
    }

    setLoading(true)
    try {
      const isPhone = /^\d+$/.test(searchInput.replace(/\s/g, ''))
      
      const url = `/api/${tenantSlug}/loyalty/lookup?${isPhone ? `phone=${searchInput}` : `publicId=${searchInput}`}`
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al buscar')
      }

      setMember(data.member)
      setClub(data.club)
      setWallet(data.wallet)
      toast.success('Miembro encontrado')
    } catch (err: any) {
      toast.error(err.message)
      setMember(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-orange-500/30">
            <QrCode size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">Club de Fidelización</h1>
          <p className="text-sm text-gray-600">
            Ingresá tu teléfono o código para ver tu tarjeta
          </p>
        </div>

        <Card className="border-2 border-border/60 rounded-[2rem] overflow-hidden shadow-xl">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-3">
              <Label className="text-xs uppercase font-black tracking-wider text-gray-500">
                Teléfono o Código
              </Label>
              <div className="flex gap-2">
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Ej: 11 1234 5678 o TGO-XXXX"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1 h-12 rounded-xl text-sm"
                />
                <Button
                  onClick={handleSearch}
                  disabled={loading}
                  className="h-12 px-4 rounded-xl bg-orange-500 hover:bg-orange-600"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search size={20} />
                  )}
                </Button>
              </div>
            </div>

            {member && club && wallet && (
              <div className="space-y-4 pt-4 border-t border-border/40">
                {/* Tarjeta Preview */}
                <div
                  className="rounded-2xl p-6 text-white shadow-xl"
                  style={{ backgroundColor: wallet.cardColor, color: wallet.labelColor }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider opacity-70">
                        {club.name}
                      </p>
                      <h3 className="text-lg font-bold">{member.name}</h3>
                    </div>
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <QrCode size={20} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-3xl font-black">{member.points.toLocaleString()}</p>
                      <p className="text-xs uppercase tracking-wider opacity-70">Puntos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium capitalize">{member.tier}</p>
                      <p className="text-xs uppercase tracking-wider opacity-70">Nivel</p>
                    </div>
                  </div>
                </div>

                {/* Estadísticas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{member.totalOrders}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Pedidos</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">${toPesos(member.totalSpent).toLocaleString('es-AR')}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Gastado</p>
                  </div>
                </div>

                {/* Botones Wallet */}
                {wallet.enabled && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Smartphone size={16} className="text-gray-500" />
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Agregar a Wallet
                      </p>
                    </div>
                    <AddToWalletButtons
                      tenantSlug={tenantSlug}
                      memberId={member.publicId}
                      publicId={member.publicId}
                      points={member.points}
                      tier={member.tier}
                    />
                  </div>
                )}

                {/* Código QR */}
                <div className="text-center">
                  <div className="inline-flex flex-col items-center gap-2 p-4 bg-white rounded-xl border-2 border-border/40">
                    <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                      <QrCode size={48} className="text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-500 font-mono">{member.publicId}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Escaneá este código en el local para acumular o canjear puntos
        </p>
      </div>
    </div>
  )
}
