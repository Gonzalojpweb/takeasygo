'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, ChevronDown, Search, User, Plus, Trash2, Home, Briefcase, Heart } from 'lucide-react'
import { useLocation, Address } from './LocationContext'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

import Image from 'next/image'

export default function HomeHeader() {
  const router = useRouter()
  const { currentAddress, savedAddresses, setAddress, addAddress, removeAddress } = useLocation()
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [newAddressForm, setNewAddressForm] = useState(false)
  const [formData, setFormData] = useState({ label: '', address: '', coordinates: { lat: -34.6037, lng: -58.3816 } })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await addAddress({
        ...formData,
        label: formData.label || 'Dirección',
        isDefault: savedAddresses.length === 0
      })
      setNewAddressForm(false)
      setFormData({ label: '', address: '', coordinates: { lat: -34.6037, lng: -58.3816 } })
      toast.success('Dirección guardada')
    } catch (err) {
      toast.error('Error al guardar dirección')
    }
  }

  const getLabelIcon = (label: string) => {
    const l = label.toLowerCase()
    if (l.includes('casa') || l.includes('hogar')) return <Home size={14} />
    if (l.includes('trabajo') || l.includes('oficina')) return <Briefcase size={14} />
    if (l.includes('novia') || l.includes('novio') || l.includes('amor')) return <Heart size={14} />
    return <MapPin size={14} />
  }

  return (
    <header className="sticky top-0 z-50 bg-[#fafafa]/90 backdrop-blur-xl border-b border-zinc-200/50 px-4 py-2">
      <div className="max-w-xl mx-auto space-y-3">
        {/* Top Row: Logo & Profile */}
        <div className="flex items-center justify-between">
          <Image
            src="https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png"
            alt="TakeasyGO"
            width={100}
            height={24}
            className="h-5 w-auto"
            unoptimized
          />
          <div className="flex items-center gap-1">
            <button
              onClick={() => router.push('/explore/profile')}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-200/50 transition-colors"
            >
              <User size={18} className="text-zinc-600" />
            </button>
          </div>
        </div>

        {/* Middle Row: Location Selector */}
        <div className="flex items-center">
          <Dialog open={showAddressModal} onOpenChange={setShowAddressModal}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1 group px-1">
                <MapPin size={14} className="text-primary shrink-0" />
                <span className="text-xs font-bold text-zinc-900 truncate">
                  {currentAddress ? currentAddress.label : 'Tu ubicación'}
                </span>
                <ChevronDown size={12} className="text-zinc-400 group-hover:text-primary transition-colors" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-[2rem] p-6 border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-black tracking-tight">Tus direcciones</DialogTitle>
              </DialogHeader>
              
              {!newAddressForm ? (
                <div className="space-y-3 py-3">
                  {savedAddresses.length > 0 ? (
                    <div className="space-y-2">
                      {savedAddresses.map((addr, i) => (
                        <div 
                          key={i}
                          className={cn(
                            "flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer",
                            currentAddress?.address === addr.address 
                              ? "border-primary bg-primary/5" 
                              : "border-zinc-100 hover:border-zinc-200"
                          )}
                          onClick={() => {
                            setAddress(addr)
                            setShowAddressModal(false)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center",
                              currentAddress?.address === addr.address ? "bg-primary text-white" : "bg-zinc-100 text-zinc-500"
                            )}>
                              {getLabelIcon(addr.label)}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-zinc-900">{addr.label}</p>
                              <p className="text-[11px] text-zinc-500 truncate max-w-[160px]">{addr.address}</p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-400 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeAddress(i)
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-muted-foreground">
                      <MapPin size={40} className="mx-auto mb-3 opacity-10" />
                      <p className="text-xs font-medium">No tenés direcciones guardadas.</p>
                    </div>
                  )}
                  
                  <Button 
                    variant="outline" 
                    className="w-full h-12 rounded-xl border-dashed border-2 font-bold text-xs gap-2"
                    onClick={() => setNewAddressForm(true)}
                  >
                    <Plus size={16} /> Nueva dirección
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleAdd} className="space-y-4 py-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Etiqueta</label>
                    <Input 
                      placeholder="Ej: Casa, Trabajo..." 
                      className="h-11 rounded-lg text-sm"
                      value={formData.label}
                      onChange={e => setFormData(p => ({ ...p, label: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Dirección completa</label>
                    <Input 
                      placeholder="Calle y número, Ciudad" 
                      className="h-11 rounded-lg text-sm"
                      value={formData.address}
                      onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button type="button" variant="ghost" className="flex-1 h-11 rounded-lg text-sm font-bold" onClick={() => setNewAddressForm(false)}>Cancelar</Button>
                    <Button type="submit" className="flex-1 h-11 rounded-lg bg-primary text-white font-bold text-sm">Guardar</Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Bottom Row: Search */}
        <div className="relative group">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-primary transition-colors" />
          <input 
            placeholder="¿Qué quieres hoy? (Sushi, Pizza, Café...)"
            className="w-full h-11 bg-zinc-200/50 border-none rounded-xl pl-11 pr-4 text-xs font-semibold focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all outline-none text-zinc-900"
          />
        </div>
      </div>
    </header>
  )
}
