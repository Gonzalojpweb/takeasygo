'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { 
  Plus, Edit2, Trash2, Eye, EyeOff, Star, 
  GripVertical, Tag, Image, DollarSign, Clock,
  Palette, X, Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Promotion {
  _id: string
  title: string
  description: string
  shortDescription?: string
  imageUrl?: string
  price: number
  originalPrice?: number
  currency: string
  conditions?: string
  details?: string
  visibility: 'both' | 'takeaway' | 'dine-in'
  isActive: boolean
  isFeatured: boolean
  scheduledStart?: string
  scheduledEnd?: string
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
    badgeColor?: string
    borderRadius?: string
    cardStyle?: 'modern' | 'classic' | 'minimal'
  }
  maxRedemptions?: number
  redemptionsCount: number
  sortOrder: number
}

interface Props {
  tenantSlug: string
  promotions: Promotion[]
}

type CardStyle = 'modern' | 'classic' | 'minimal'

export default function PromotionsManager({ tenantSlug, promotions: initialPromotions }: Props) {
  const [promotions, setPromotions] = useState<Promotion[]>(initialPromotions)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [form, setForm] = useState({
    title: '',
    description: '',
    shortDescription: '',
    imageUrl: '',
    price: 0,
    originalPrice: '',
    currency: 'USD',
    conditions: '',
    details: '',
    visibility: 'both' as 'both' | 'takeaway' | 'dine-in',
    isActive: true,
    isFeatured: false,
    scheduledStart: '',
    scheduledEnd: '',
    maxRedemptions: '',
    customStyles: {
      backgroundColor: '#1a1a1a',
      textColor: '#ffffff',
      accentColor: '#f14722',
      badgeColor: '#f14722',
      borderRadius: '12px',
      cardStyle: 'modern' as CardStyle,
    },
  })

  const filteredPromotions = promotions.filter(p => {
    if (filter === 'active') return p.isActive
    if (filter === 'inactive') return !p.isActive
    return true
  })

  function openCreateModal() {
    setEditingPromotion(null)
    setForm({
      title: '',
      description: '',
      shortDescription: '',
      imageUrl: '',
      price: 0,
      originalPrice: '',
      currency: 'USD',
      conditions: '',
      details: '',
      visibility: 'both',
      isActive: true,
      isFeatured: false,
      scheduledStart: '',
      scheduledEnd: '',
      maxRedemptions: '',
      customStyles: {
        backgroundColor: '#1a1a1a',
        textColor: '#ffffff',
        accentColor: '#f14722',
        badgeColor: '#f14722',
        borderRadius: '12px',
        cardStyle: 'modern',
      },
    })
    setIsModalOpen(true)
  }

  function openEditModal(promotion: Promotion) {
    setEditingPromotion(promotion)
    setForm({
      title: promotion.title,
      description: promotion.description,
      shortDescription: promotion.shortDescription || '',
      imageUrl: promotion.imageUrl || '',
      price: promotion.price,
      originalPrice: promotion.originalPrice?.toString() || '',
      currency: promotion.currency,
      conditions: promotion.conditions || '',
      details: promotion.details || '',
      visibility: promotion.visibility,
      isActive: promotion.isActive,
      isFeatured: promotion.isFeatured,
      scheduledStart: promotion.scheduledStart ? promotion.scheduledStart.split('T')[0] : '',
      scheduledEnd: promotion.scheduledEnd ? promotion.scheduledEnd.split('T')[0] : '',
      maxRedemptions: promotion.maxRedemptions?.toString() || '',
      customStyles: {
        backgroundColor: promotion.customStyles?.backgroundColor || '#1a1a1a',
        textColor: promotion.customStyles?.textColor || '#ffffff',
        accentColor: promotion.customStyles?.accentColor || '#f14722',
        badgeColor: promotion.customStyles?.badgeColor || '#f14722',
        borderRadius: promotion.customStyles?.borderRadius || '12px',
        cardStyle: promotion.customStyles?.cardStyle || 'modern',
      },
    })
    setIsModalOpen(true)
  }

  async function handleSave() {
    setLoading(true)
    try {
      const payload = {
        ...form,
        originalPrice: form.originalPrice ? parseFloat(form.originalPrice) : null,
        maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions) : null,
        scheduledStart: form.scheduledStart ? new Date(form.scheduledStart) : null,
        scheduledEnd: form.scheduledEnd ? new Date(form.scheduledEnd) : null,
      }

      const url = editingPromotion 
        ? `/api/${tenantSlug}/promotions/${editingPromotion._id}`
        : `/api/${tenantSlug}/promotions`
      
      const method = editingPromotion ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error()

      const data = await res.json()

      if (editingPromotion) {
        setPromotions(prev => prev.map(p => p._id === editingPromotion._id ? data.promotion : p))
        toast.success('Promoción actualizada')
      } else {
        setPromotions(prev => [data.promotion, ...prev])
        toast.success('Promoción creada')
      }

      setIsModalOpen(false)
    } catch {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(promotion: Promotion) {
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/${promotion._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !promotion.isActive }),
      })
      if (!res.ok) throw new Error()
      setPromotions(prev => prev.map(p => p._id === promotion._id ? { ...p, isActive: !p.isActive } : p))
      toast.success(promotion.isActive ? 'Promoción desactivada' : 'Promoción activada')
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function handleDelete(promotion: Promotion) {
    if (!confirm('¿Eliminar esta promoción?')) return
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/${promotion._id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setPromotions(prev => prev.filter(p => p._id !== promotion._id))
      toast.success('Promoción eliminada')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  async function handleToggleFeatured(promotion: Promotion) {
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/${promotion._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: !promotion.isFeatured }),
      })
      if (!res.ok) throw new Error()
      setPromotions(prev => prev.map(p => p._id === promotion._id ? { ...p, isFeatured: !promotion.isFeatured } : p))
    } catch {
      toast.error('Error al actualizar')
    }
  }

  function getDiscountPercent(promotion: Promotion) {
    if (!promotion.originalPrice) return 0
    return Math.round(((promotion.originalPrice - promotion.price) / promotion.originalPrice) * 100)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex bg-muted/50 rounded-xl p-1">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                  filter === f 
                    ? 'bg-white text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : 'Inactivas'}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground text-sm font-medium">
            {filteredPromotions.length} promoción{filteredPromotions.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <Button onClick={openCreateModal} className="bg-primary hover:bg-primary/90 text-white font-bold">
          <Plus size={18} className="mr-2" />
          Nueva Promoción
        </Button>
      </div>

      {/* Grid */}
      {filteredPromotions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No hay promociones</p>
          <p className="text-sm">Crea tu primera promoción</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPromotions.map(promotion => (
            <Card key={promotion._id} className="bg-card border-border/60 overflow-hidden group hover:border-primary/30 transition-all">
              {promotion.imageUrl && (
                <div className="aspect-video bg-muted relative overflow-hidden">
                  <img src={promotion.imageUrl} alt={promotion.title} className="w-full h-full object-cover" />
                  {promotion.isFeatured && (
                    <span className="absolute top-3 left-3 bg-yellow-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1">
                      <Star size={10} fill="white" /> Destacada
                    </span>
                  )}
                </div>
              )}
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground truncate">{promotion.title}</h3>
                    {promotion.shortDescription && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{promotion.shortDescription}</p>
                    )}
                  </div>
                  <div className={cn(
                    'w-2 h-2 rounded-full ml-2 shrink-0',
                    promotion.isActive ? 'bg-emerald-500' : 'bg-muted'
                  )} />
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl font-black text-primary">${promotion.price}</span>
                  {promotion.originalPrice && (
                    <>
                      <span className="text-sm text-muted-foreground line-through">${promotion.originalPrice}</span>
                      <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                        -{getDiscountPercent(promotion)}%
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  {promotion.visibility === 'both' ? (
                    <span className="bg-muted px-2 py-1 rounded-full">🍽️ Dine-in + 🚀 Takeaway</span>
                  ) : promotion.visibility === 'dine-in' ? (
                    <span className="bg-muted px-2 py-1 rounded-full">🍽️ Dine-in</span>
                  ) : (
                    <span className="bg-muted px-2 py-1 rounded-full">🚀 Takeaway</span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border/40">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => openEditModal(promotion)}>
                    <Edit2 size={14} className="mr-1" /> Editar
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className={promotion.isActive ? 'text-amber-500' : 'text-emerald-500'}
                    onClick={() => handleToggleActive(promotion)}
                  >
                    {promotion.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className={promotion.isFeatured ? 'text-yellow-500' : 'text-muted-foreground'}
                    onClick={() => handleToggleFeatured(promotion)}
                  >
                    <Star size={14} className={promotion.isFeatured ? 'fill-yellow-500' : ''} />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(promotion)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background border border-border rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-background border-b border-border p-6 flex items-center justify-between rounded-t-3xl">
                <h2 className="text-xl font-bold">{editingPromotion ? 'Editar' : 'Nueva'} Promoción</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                  <X size={20} />
                </Button>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Título *</Label>
                    <Input 
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder="ej: 2x1 en Hamburgesas"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Descripción</Label>
                    <Textarea 
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Descripción detallada de la promoción..."
                      className="mt-1.5"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Descripción Corta</Label>
                    <Input 
                      value={form.shortDescription}
                      onChange={e => setForm({ ...form, shortDescription: e.target.value })}
                      placeholder="ej: Válido solo días lunes"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Imagen URL</Label>
                    <Input 
                      value={form.imageUrl}
                      onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                      placeholder="https://..."
                      className="mt-1.5"
                    />
                  </div>
                </div>

                {/* Price */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Precio *</Label>
                    <Input 
                      type="number"
                      value={form.price}
                      onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Precio Original</Label>
                    <Input 
                      type="number"
                      value={form.originalPrice}
                      onChange={e => setForm({ ...form, originalPrice: e.target.value })}
                      placeholder="Para mostrar descuento"
                      className="mt-1.5"
                    />
                  </div>
                </div>

                {/* Visibility */}
                <div>
                  <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground mb-3 block">Publicar en</Label>
                  <div className="flex gap-3">
                    {(['both', 'dine-in', 'takeaway'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setForm({ ...form, visibility: v })}
                        className={cn(
                          'flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all',
                          form.visibility === v 
                            ? 'border-primary bg-primary/10 text-primary' 
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        )}
                      >
                        {v === 'both' ? '🍽️ + 🚀 Ambos' : v === 'dine-in' ? '🍽️ Dine-in' : '🚀 Takeaway'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Schedule */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Inicio</Label>
                    <Input 
                      type="date"
                      value={form.scheduledStart}
                      onChange={e => setForm({ ...form, scheduledStart: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Fin</Label>
                    <Input 
                      type="date"
                      value={form.scheduledEnd}
                      onChange={e => setForm({ ...form, scheduledEnd: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                </div>

                {/* Conditions */}
                <div>
                  <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Términos y Condiciones</Label>
                  <Textarea 
                    value={form.conditions}
                    onChange={e => setForm({ ...form, conditions: e.target.value })}
                    placeholder="ej: No acumulable con otras ofertas..."
                    className="mt-1.5"
                    rows={2}
                  />
                </div>

                {/* Custom Styles */}
                <div className="space-y-4 bg-muted/30 p-5 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Palette size={16} className="text-primary" />
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Estilos Custom</Label>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Fondo</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input 
                          type="color" 
                          value={form.customStyles.backgroundColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, backgroundColor: e.target.value } })}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <Input 
                          value={form.customStyles.backgroundColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, backgroundColor: e.target.value } })}
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Texto</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input 
                          type="color" 
                          value={form.customStyles.textColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, textColor: e.target.value } })}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <Input 
                          value={form.customStyles.textColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, textColor: e.target.value } })}
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Acento</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input 
                          type="color" 
                          value={form.customStyles.accentColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, accentColor: e.target.value } })}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <Input 
                          value={form.customStyles.accentColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, accentColor: e.target.value } })}
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground">Estilo de Card</Label>
                    <div className="flex gap-2 mt-2">
                      {(['modern', 'classic', 'minimal'] as const).map(style => (
                        <button
                          key={style}
                          onClick={() => setForm({ ...form, customStyles: { ...form.customStyles, cardStyle: style } })}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-xs font-bold uppercase border-2 transition-all',
                            form.customStyles.cardStyle === style
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground'
                          )}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground mb-3 block">Vista Previa</Label>
                  <div 
                    className="rounded-xl p-4 border-2"
                    style={{ 
                      backgroundColor: form.customStyles.backgroundColor,
                      borderColor: form.customStyles.accentColor,
                      borderRadius: form.customStyles.borderRadius 
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span 
                        className="text-xs font-bold px-2 py-1 rounded-full"
                        style={{ 
                          backgroundColor: form.customStyles.badgeColor,
                          color: form.customStyles.textColor 
                        }}
                      >
                        {form.customStyles.cardStyle?.toUpperCase()}
                      </span>
                    </div>
                    <h4 
                      className="font-bold text-lg mb-1"
                      style={{ color: form.customStyles.textColor }}
                    >
                      {form.title || 'Título de la promo'}
                    </h4>
                    <p 
                      className="text-sm mb-2"
                      style={{ color: form.customStyles.textColor, opacity: 0.7 }}
                    >
                      {form.shortDescription || 'Descripción corta...'}
                    </p>
                    <div className="flex items-center gap-2">
                      <span 
                        className="text-2xl font-black"
                        style={{ color: form.customStyles.accentColor }}
                      >
                        ${form.price || '0'}
                      </span>
                      {form.originalPrice && (
                        <span 
                          className="text-sm line-through"
                          style={{ color: form.customStyles.textColor, opacity: 0.5 }}
                        >
                          ${form.originalPrice}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-muted/50 p-6 border-t border-border flex justify-end gap-3 rounded-b-3xl">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={loading || !form.title || form.price <= 0}
                  className="bg-primary hover:bg-primary/90 text-white font-bold"
                >
                  {loading ? 'Guardando...' : editingPromotion ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}