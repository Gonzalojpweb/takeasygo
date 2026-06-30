'use client'

import React, { useState, useEffect } from 'react'
import HomeHeader from './HomeHeader'
import PromoCarousel from './PromoCarousel'
import CategoryGrid from './CategoryGrid'
import MarketingCarousel from './MarketingCarousel'
import HomeRedemptions from './HomeRedemptions'
import { useLocation } from './LocationContext'
import { GpsLoading } from './ExploreLoadingSkeleton'
import RestaurantCard from './RestaurantCard'
import { BlurFade } from '@/components/ui/blur-fade'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'

export default function HomeView({ onOpenLeadModal, onCategorySelect }: { onOpenLeadModal: () => void; onCategorySelect?: (name: string) => void }) {
  const { currentAddress, loading: locationLoading } = useLocation()
  const { setTenantSlug } = useTenant()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentAddress) {
      fetchHomeData()
    }
  }, [currentAddress])

  const fetchHomeData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/explore/home?lat=${currentAddress?.coordinates.lat}&lng=${currentAddress?.coordinates.lng}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Error fetching home data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (locationLoading || (loading && !data)) {
    return (
      <div className="h-full bg-white">
         <HomeHeader />
         <div className="p-8 space-y-8">
            <div className="h-40 bg-zinc-100 rounded-[2rem] animate-pulse" />
            <div className="grid grid-cols-4 gap-4">
               {[1,2,3,4].map(i => <div key={i} className="h-16 bg-zinc-100 rounded-3xl animate-pulse" />)}
            </div>
            <div className="h-64 bg-zinc-100 rounded-[2.5rem] animate-pulse" />
         </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-white overflow-y-auto no-scrollbar pb-32">
      <HomeHeader />
      
      <PromoCarousel promos={data?.promotions || []} />
      
      <CategoryGrid onCategorySelect={onCategorySelect} />
      
      <MarketingCarousel campaigns={data?.marketingCampaigns || []} />
      
      {/* Featured Restaurants Section */}
      <section className="py-6 px-4">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Cerca tuyo</h2>
          <p className="text-xs text-slate-500 font-medium">Los mejores locales en tu zona</p>
        </div>
        <div className="space-y-4">
          {data?.nearbyTenants?.map((r: any, i: number) => (
            <BlurFade key={r.id} delay={i * 0.05} inView>
              <div 
                onClick={() => {
                  setTenantSlug(r.id)
                  router.push(`/app/${r.id}?type=${r.type}`)
                }}
                className="cursor-pointer"
              >
                <RestaurantCard 
                  restaurant={r as any}
                  onNavigate={() => {
                    setTenantSlug(r.id)
                    router.push(`/app/${r.id}?type=${r.type}`)
                  }} 
                />
              </div>
            </BlurFade>
          ))}
        </div>
      </section>

      <HomeRedemptions items={data?.redemptions || []} />

      {/* B2B Footer CTA */}
      <section className="px-4 py-8">
        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-center space-y-4 shadow-2xl shadow-slate-200">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto">
             <span className="text-3xl">🚀</span>
          </div>
          <div className="space-y-2">
            <h3 className="text-white font-black text-xl">¿Tenés un restaurante?</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Sumate a la plataforma que potencia locales sin comisiones abusivas. 
              Vende directo, fideliza a tus clientes.
            </p>
          </div>
          <button
            onClick={onOpenLeadModal}
            className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs"
          >
            Registrar mi local ahora
          </button>
        </div>
      </section>
    </div>
  )
}
