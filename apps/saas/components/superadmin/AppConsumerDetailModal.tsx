'use client'

import {
  Loader2,
  X,
  MapPin,
  Calendar,
  Bell,
  BellOff,
  CheckCircle2,
  XCircle,
  Utensils,
  Sparkles,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface ConsumerData {
  _id: string
  name: string
  email: string
  image?: string
  isActive: boolean
  createdAt: string
  preferences: {
    displayName: string
    age: number
    zone: string
    cuisinePreferences: string[]
    experiencePreferences: string[]
    onboardingCompleted: boolean
    notificationPermission: 'granted' | 'denied' | 'default'
  } | null
}

interface Props {
  consumer: ConsumerData
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AppConsumerDetailModal({ consumer, open, onOpenChange }: Props) {
  const p = consumer.preferences

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[2rem] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 rounded-full">
                {consumer.image ? (
                  <AvatarImage src={consumer.image} alt={consumer.name} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                  {consumer.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-xl font-bold">{consumer.name}</DialogTitle>
                <p className="text-sm text-muted-foreground font-mono mt-0.5">{consumer.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge className="text-[9px] font-black uppercase tracking-widest border-2 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    App
                  </Badge>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-bold',
                    consumer.isActive ? 'text-emerald-500' : 'text-muted-foreground'
                  )}>
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      consumer.isActive ? 'bg-emerald-500' : 'bg-muted-foreground'
                    )} />
                    {consumer.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="rounded-xl shrink-0">
              <X size={18} />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-2xl bg-muted/30 border border-border/60 text-center">
              <Calendar size={16} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Registrado</p>
              <p className="text-sm font-bold">{formatDate(consumer.createdAt)}</p>
            </div>
            <div className="p-3 rounded-2xl bg-muted/30 border border-border/60 text-center">
              <User size={16} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Edad</p>
              <p className="text-sm font-bold">{p?.age ?? '—'}</p>
            </div>
            <div className="p-3 rounded-2xl bg-muted/30 border border-border/60 text-center">
              {p?.notificationPermission === 'granted' ? (
                <Bell size={16} className="mx-auto text-amber-500 mb-1" />
              ) : (
                <BellOff size={16} className="mx-auto text-muted-foreground mb-1" />
              )}
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Notificaciones</p>
              <p className="text-sm font-bold">
                {p?.notificationPermission === 'granted' ? 'Sí' : 'No'}
              </p>
            </div>
          </div>

          {/* Onboarding status */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/20 border border-border/40">
            {p?.onboardingCompleted ? (
              <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
            ) : (
              <XCircle size={20} className="text-muted-foreground/30 shrink-0" />
            )}
            <div>
              <p className="text-sm font-bold">Onboarding</p>
              <p className="text-xs text-muted-foreground">
                {p?.onboardingCompleted ? 'Completado' : 'No completado'}
              </p>
            </div>
          </div>

          {/* Zone */}
          {p?.zone && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <MapPin size={16} className="text-primary" /> Zona
              </h4>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 border-2 text-xs font-bold">
                {p.zone}
              </Badge>
            </div>
          )}

          {/* Cuisine preferences */}
          {p?.cuisinePreferences && p.cuisinePreferences.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Utensils size={16} className="text-primary" /> Cocinas preferidas
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {p.cuisinePreferences.map(cu => (
                  <Badge key={cu} variant="outline" className="text-xs font-bold border-border/60">
                    {cu}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Experience preferences */}
          {p?.experiencePreferences && p.experiencePreferences.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Experiencias preferidas
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {p.experiencePreferences.map(ex => (
                  <Badge key={ex} variant="outline" className="text-xs font-bold border-border/60">
                    {ex}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* No preferences */}
          {!p && (
            <div className="py-8 text-center">
              <User size={32} className="mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground font-medium">
                Este usuario no completó el onboarding.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                No hay preferencias guardadas.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


