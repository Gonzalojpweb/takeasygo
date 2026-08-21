'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Calendar, Plus, Trash2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface SpecialDateRule {
  id: string
  name: string
  date: { month: number; day: number }
  triggerItems: string[]
  suggestedItems: string[]
}

interface Props {
  tenantSlug: string
}

export default function SpecialDatesConfig({ tenantSlug }: Props) {
  const [rules, setRules] = useState<SpecialDateRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRule, setEditingRule] = useState<Partial<SpecialDateRule>>({
    name: '',
    date: { month: 8, day: 20 },
    triggerItems: [],
    suggestedItems: [],
  })
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchRules()
  }, [])

  async function fetchRules() {
    try {
      const res = await fetch(`/api/${tenantSlug}/special-dates`)
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules || [])
      }
    } catch (error) {
      console.error('Error fetching special dates:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveRule() {
    if (!editingRule.name || !editingRule.triggerItems?.length || !editingRule.suggestedItems?.length) {
      return toast.error('Completá todos los campos')
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/special-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRule),
      })
      if (res.ok) {
        toast.success('Fecha especial guardada')
        setShowAddForm(false)
        setEditingRule({
          name: '',
          date: { month: 8, day: 20 },
          triggerItems: [],
          suggestedItems: [],
        })
        fetchRules()
      } else {
        toast.error('Error al guardar')
      }
    } catch {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('¿Eliminar esta fecha especial?')) return
    
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/special-dates/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Fecha especial eliminada')
        fetchRules()
      } else {
        toast.error('Error al eliminar')
      }
    } catch {
      toast.error('Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  const addTriggerItem = (item: string) => {
    if (item && !editingRule.triggerItems?.includes(item)) {
      setEditingRule(prev => ({
        ...prev,
        triggerItems: [...(prev.triggerItems || []), item],
      }))
    }
  }

  const removeTriggerItem = (item: string) => {
    setEditingRule(prev => ({
      ...prev,
      triggerItems: prev.triggerItems?.filter(i => i !== item) || [],
    }))
  }

  const addSuggestedItem = (item: string) => {
    if (item && !editingRule.suggestedItems?.includes(item)) {
      setEditingRule(prev => ({
        ...prev,
        suggestedItems: [...(prev.suggestedItems || []), item],
      }))
    }
  }

  const removeSuggestedItem = (item: string) => {
    setEditingRule(prev => ({
      ...prev,
      suggestedItems: prev.suggestedItems?.filter(i => i !== item) || [],
    }))
  }

  const isActiveToday = (rule: SpecialDateRule) => {
    const now = new Date()
    return rule.date.month === now.getMonth() + 1 && rule.date.day === now.getDate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Fechas Especiales de Upselling</h2>
          <p className="text-zinc-400 mt-1">Configura fechas especiales para sobrescribir las sugerencias automáticas</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-[#f74211] hover:bg-[#f74211]/90">
          <Plus size={16} className="mr-2" />
          Nueva Fecha
        </Button>
      </div>

      {showAddForm && (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white">Nueva Fecha Especial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Nombre</label>
              <Input
                value={editingRule.name}
                onChange={(e) => setEditingRule(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Día de la Papa Frita"
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-zinc-400 block mb-2">Mes (1-12)</label>
                <Input
                  type="number"
                  min="1"
                  max="12"
                  value={editingRule.date?.month}
                  onChange={(e) => setEditingRule(prev => ({
                    ...prev,
                    date: { ...prev.date!, month: parseInt(e.target.value) }
                  }))}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 block mb-2">Día (1-31)</label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={editingRule.date?.day}
                  onChange={(e) => setEditingRule(prev => ({
                    ...prev,
                    date: { ...prev.date!, day: parseInt(e.target.value) }
                  }))}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-2">
                Ítems que disparan la regla (separados por coma)
              </label>
              <Input
                placeholder="hamburguesa, burger, bebida, drink"
                className="bg-zinc-900 border-zinc-700 text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTriggerItem(e.currentTarget.value)
                    e.currentTarget.value = ''
                  }
                }}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {editingRule.triggerItems?.map(item => (
                  <Badge key={item} variant="secondary" className="flex items-center gap-1">
                    {item}
                    <button onClick={() => removeTriggerItem(item)} className="hover:text-red-400">×</button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-2">
                Ítems a sugerir (separados por coma)
              </label>
              <Input
                placeholder="papa, papas, frita, fritas"
                className="bg-zinc-900 border-zinc-700 text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSuggestedItem(e.currentTarget.value)
                    e.currentTarget.value = ''
                  }
                }}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {editingRule.suggestedItems?.map(item => (
                  <Badge key={item} variant="secondary" className="flex items-center gap-1">
                    {item}
                    <button onClick={() => removeSuggestedItem(item)} className="hover:text-red-400">×</button>
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRule} className="bg-[#f74211] hover:bg-[#f74211]/90">
                Guardar
              </Button>
              <Button onClick={() => setShowAddForm(false)} variant="outline">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {rules.map(rule => (
          <Card key={rule.id} className={`bg-zinc-800 border-zinc-700 ${isActiveToday(rule) ? 'border-[#f74211] ring-1 ring-[#f74211]/50' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar size={18} className={isActiveToday(rule) ? 'text-[#f74211]' : 'text-zinc-400'} />
                    <h3 className="text-lg font-bold text-white">{rule.name}</h3>
                    {isActiveToday(rule) && (
                      <Badge className="bg-[#f74211] text-white">Activo hoy</Badge>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mb-2">
                    {rule.date.day}/{rule.date.month}
                  </p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Al agregar:</p>
                      <div className="flex flex-wrap gap-1">
                        {rule.triggerItems.map(item => (
                          <Badge key={item} variant="outline" className="text-xs">{item}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Sugerir:</p>
                      <div className="flex flex-wrap gap-1">
                        {rule.suggestedItems.map(item => (
                          <Badge key={item} variant="outline" className="text-xs">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => deleteRule(rule.id)}
                  variant="ghost"
                  size="icon"
                  className="text-zinc-400 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {rules.length === 0 && !loading && (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="py-12 text-center">
            <Sparkles size={48} className="mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-500">No hay fechas especiales configuradas</p>
            <p className="text-zinc-600 text-sm mt-2">
              Agrega fechas especiales para sobrescribir las sugerencias de upselling en días específicos
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
