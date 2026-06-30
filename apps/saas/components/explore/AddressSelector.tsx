'use client'

import { useState } from 'react'
import { MapPin, Plus, Trash2, Check, X, Loader2, Home, Briefcase, MapPin as MapPinIcon } from 'lucide-react'
import { useLocation } from '@/components/explore/LocationContext'
import { useSession } from 'next-auth/react'

interface AddressSelectorProps {
  onClose?: () => void
  showAddButton?: boolean
}

export default function AddressSelector({ onClose, showAddButton = true }: AddressSelectorProps) {
  const { currentAddress, savedAddresses, loading, setAddress, addAddress, removeAddress, refreshAddresses } = useLocation()
  const { data: session } = useSession()
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newAddress, setNewAddress] = useState({
    label: 'Casa',
    address: '',
    city: '',
    coordinates: { lat: 0, lng: 0 }
  })

  const handleAddAddress = async () => {
    if (!newAddress.address || !newAddress.coordinates.lat || !newAddress.coordinates.lng) {
      alert('Por favor completa la dirección y las coordenadas')
      return
    }

    setAdding(true)
    try {
      await addAddress({
        ...newAddress,
        isDefault: savedAddresses.length === 0
      })
      setShowAddForm(false)
      setNewAddress({
        label: 'Casa',
        address: '',
        city: '',
        coordinates: { lat: 0, lng: 0 }
      })
      await refreshAddresses()
    } catch (error) {
      console.error('Error adding address:', error)
      alert('Error al agregar dirección')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveAddress = async (index: number) => {
    if (!confirm('¿Eliminar esta dirección?')) return
    try {
      await removeAddress(index)
      await refreshAddresses()
    } catch (error) {
      console.error('Error removing address:', error)
      alert('Error al eliminar dirección')
    }
  }

  const handleSelectAddress = (address: any) => {
    setAddress(address)
    onClose?.()
  }

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocalización no soportada')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewAddress({
          ...newAddress,
          coordinates: {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        })
      },
      (error) => {
        console.error('Error getting location:', error)
        alert('Error al obtener ubicación')
      }
    )
  }

  const getLabelIcon = (label: string) => {
    const lower = label.toLowerCase()
    if (lower.includes('casa') || lower.includes('home')) return <Home size={16} />
    if (lower.includes('trabajo') || lower.includes('work') || lower.includes('oficina')) return <Briefcase size={16} />
    return <MapPinIcon size={16} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="text-[#f14722] animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Current Address */}
      {currentAddress && (
        <div className="glass-card rounded-2xl p-4 border-[#f14722]/30 bg-[#f14722]/5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#f14722] flex items-center justify-center shrink-0">
              <Check size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#f14722] uppercase tracking-wider mb-1">
                Dirección Actual
              </p>
              <p className="text-sm font-bold text-[#f7f4f2] truncate">
                {currentAddress.label}
              </p>
              <p className="text-xs text-[#5a524d] truncate">
                {currentAddress.address}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Saved Addresses */}
      {savedAddresses.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#5a524d] ml-1">
            Direcciones Guardadas
          </p>
          {savedAddresses.map((addr, index) => (
            <button
              key={index}
              onClick={() => handleSelectAddress(addr)}
              className={`w-full glass-card rounded-2xl p-4 flex items-center gap-3 group transition-all ${
                currentAddress?.address === addr.address ? 'border-[#f14722]/30 bg-[#f14722]/5' : 'hover:border-[var(--c-border-active)]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center text-[#5a524d] shrink-0">
                {getLabelIcon(addr.label)}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-bold text-[#f7f4f2] truncate">
                  {addr.label}
                </p>
                <p className="text-xs text-[#5a524d] truncate">
                  {addr.address}
                </p>
              </div>
              {session?.user && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveAddress(index)
                  }}
                  className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Add Address Button */}
      {showAddButton && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 group hover:border-[var(--c-border-active)] transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-[#f14722] flex items-center justify-center text-white shrink-0">
            <Plus size={16} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-[#f7f4f2]">Agregar Nueva Dirección</p>
            <p className="text-xs text-[#5a524d]">Guardar una dirección para pedidos</p>
          </div>
        </button>
      )}

      {/* Add Address Form */}
      {showAddForm && (
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[#f7f4f2]">Nueva Dirección</p>
            <button
              onClick={() => setShowAddForm(false)}
              className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center text-[#5a524d] hover:bg-[var(--c-border)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5a524d]">
              Etiqueta
            </label>
            <select
              value={newAddress.label}
              onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
              className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-4 py-2.5 text-sm text-[#f7f4f2] focus:outline-none focus:ring-2 focus:ring-[#f14722]/30"
            >
              <option value="Casa">Casa</option>
              <option value="Trabajo">Trabajo</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5a524d]">
              Dirección
            </label>
            <input
              type="text"
              value={newAddress.address}
              onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
              placeholder="Calle 123, Ciudad"
              className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-4 py-2.5 text-sm text-[#f7f4f2] placeholder-[#5a524d] focus:outline-none focus:ring-2 focus:ring-[#f14722]/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5a524d]">
              Ciudad (opcional)
            </label>
            <input
              type="text"
              value={newAddress.city}
              onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
              placeholder="Buenos Aires"
              className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-4 py-2.5 text-sm text-[#f7f4f2] placeholder-[#5a524d] focus:outline-none focus:ring-2 focus:ring-[#f14722]/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5a524d]">
              Coordenadas
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.000001"
                value={newAddress.coordinates.lat || ''}
                onChange={(e) => setNewAddress({
                  ...newAddress,
                  coordinates: { ...newAddress.coordinates, lat: parseFloat(e.target.value) || 0 }
                })}
                placeholder="Latitud"
                className="flex-1 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-4 py-2.5 text-sm text-[#f7f4f2] placeholder-[#5a524d] focus:outline-none focus:ring-2 focus:ring-[#f14722]/30"
              />
              <input
                type="number"
                step="0.000001"
                value={newAddress.coordinates.lng || ''}
                onChange={(e) => setNewAddress({
                  ...newAddress,
                  coordinates: { ...newAddress.coordinates, lng: parseFloat(e.target.value) || 0 }
                })}
                placeholder="Longitud"
                className="flex-1 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-4 py-2.5 text-sm text-[#f7f4f2] placeholder-[#5a524d] focus:outline-none focus:ring-2 focus:ring-[#f14722]/30"
              />
            </div>
            <button
              type="button"
              onClick={handleGetCurrentLocation}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-xs text-[#5a524d] hover:bg-[var(--c-border)] transition-colors"
            >
              <MapPin size={14} />
              Usar mi ubicación actual
            </button>
          </div>

          <button
            onClick={handleAddAddress}
            disabled={adding || !newAddress.address || !newAddress.coordinates.lat || !newAddress.coordinates.lng}
            className="w-full py-3 rounded-xl bg-[#f14722] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d93a1d] transition-colors"
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Dirección'}
          </button>
        </div>
      )}

      {!session?.user && savedAddresses.length === 0 && (
        <p className="text-center text-xs text-[#5a524d] py-4">
          Iniciá sesión para guardar tus direcciones
        </p>
      )}
    </div>
  )
}
