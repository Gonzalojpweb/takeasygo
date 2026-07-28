'use client'

import { useState } from 'react'
import { MapPin, Plus, Trash2, Check, X, Loader2, Home, Briefcase, MapPin as MapPinIcon } from 'lucide-react'
import { useLocation } from '@/components/explore/LocationContext'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useHaptic } from '@/components/tgo/useHaptic'

interface AddressSelectorProps {
  onClose?: () => void
  showAddButton?: boolean
}

export default function AddressSelector({ onClose, showAddButton = true }: AddressSelectorProps) {
  const haptic = useHaptic()
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
      toast.error('Completá la dirección y las coordenadas')
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
      toast.error('Error al agregar dirección')
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
      toast.error('Error al eliminar dirección')
    }
  }

  const handleSelectAddress = (address: any) => {
    setAddress(address)
    onClose?.()
  }

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no soportada')
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
        toast.error('Error al obtener ubicación')
      }
    )
  }

  const getLabelIcon = (label: string) => {
    const lower = label.toLowerCase()
    if (lower.includes('casa') || lower.includes('home')) return <Home size={16} />
    if (lower.includes('trabajo') || lower.includes('work') || lower.includes('oficina')) return <Briefcase size={16} />
    return <MapPinIcon size={16} />
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--tgo-surface-1)',
    border: '1px solid var(--tgo-border)',
    borderRadius: 'var(--tgo-radius-md)',
    padding: '10px 16px',
    fontSize: 'var(--tgo-type-body-sm)',
    color: 'var(--tgo-text-primary)',
    outline: 'none',
  }

  const inputFocusStyle = 'focus:ring-2 focus:ring-[var(--tgo-border-focus)]/30'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} style={{ color: 'var(--tgo-text-muted)' }} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Current Address */}
      {currentAddress && (
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: 'var(--tgo-state-trust-soft)',
            border: '1px solid var(--tgo-state-trust)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--tgo-state-action)' }}
            >
              <Check size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="uppercase tracking-wider mb-1"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                   color: 'var(--tgo-state-trust)',
                }}
              >
                Dirección Actual
              </p>
              <p className="text-sm font-bold truncate" style={{ color: 'var(--tgo-text-primary)' }}>
                {currentAddress.label}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--tgo-text-muted)' }}>
                {currentAddress.address}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Saved Addresses */}
      {savedAddresses.length > 0 && (
        <div className="space-y-2">
          <p
            className="ml-1 uppercase tracking-widest"
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: 'var(--tgo-text-muted)',
            }}
          >
            Direcciones Guardadas
          </p>
          {savedAddresses.map((addr, index) => {
            const isActive = currentAddress?.address === addr.address
            return (
              <button
                key={index}
                onClick={() => { haptic.selection(); handleSelectAddress(addr) }}
                aria-label={`Seleccionar ${addr.label}`}
                className="w-full p-4 flex items-center gap-3 group transition-all"
                style={{
                  borderRadius: 'var(--tgo-radius-xl)',
                  backgroundColor: isActive ? 'var(--tgo-state-trust-soft)' : 'var(--tgo-surface-card)',
                  border: `1px solid ${isActive ? 'var(--tgo-state-trust)' : 'var(--tgo-border)'}`,
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--tgo-surface-1)',
                    color: 'var(--tgo-text-muted)',
                  }}
                >
                  {getLabelIcon(addr.label)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--tgo-text-primary)' }}>
                    {addr.label}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--tgo-text-muted)' }}>
                    {addr.address}
                  </p>
                </div>
                {session?.user && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      haptic.warning()
                      handleRemoveAddress(index)
                    }}
                    aria-label={`Eliminar dirección ${addr.label}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Add Address Button */}
      {showAddButton && !showAddForm && (
        <button
          onClick={() => { haptic.impact('light'); setShowAddForm(true) }}
          aria-label="Agregar nueva dirección"
          className="w-full p-4 flex items-center gap-3 transition-all"
          style={{
            borderRadius: 'var(--tgo-radius-xl)',
            backgroundColor: 'var(--tgo-surface-card)',
            border: '1px solid var(--tgo-border)',
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: 'var(--tgo-state-action)' }}
          >
            <Plus size={16} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
              Agregar Nueva Dirección
            </p>
            <p className="text-xs" style={{ color: 'var(--tgo-text-muted)' }}>
              Guardar una dirección para pedidos
            </p>
          </div>
        </button>
      )}

      {/* Add Address Form */}
      {showAddForm && (
        <div
          className="p-4 space-y-3"
          style={{
            borderRadius: 'var(--tgo-radius-xl)',
            backgroundColor: 'var(--tgo-surface-card)',
            border: '1px solid var(--tgo-border)',
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
              Nueva Dirección
            </p>
            <button
              onClick={() => { haptic.impact('light'); setShowAddForm(false) }}
              aria-label="Cerrar formulario"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{
                backgroundColor: 'var(--tgo-surface-1)',
                color: 'var(--tgo-text-muted)',
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-2">
            <label
              className="uppercase tracking-widest"
              style={{ fontSize: 10, fontWeight: 700, color: 'var(--tgo-text-muted)' }}
            >
              Etiqueta
            </label>
            <select
              value={newAddress.label}
              onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
              className={inputFocusStyle}
              style={inputStyle}
            >
              <option value="Casa">Casa</option>
              <option value="Trabajo">Trabajo</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="uppercase tracking-widest"
              style={{ fontSize: 10, fontWeight: 700, color: 'var(--tgo-text-muted)' }}
            >
              Dirección
            </label>
            <input
              type="text"
              value={newAddress.address}
              onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
              placeholder="Calle 123, Ciudad"
              className={inputFocusStyle}
              style={{ ...inputStyle, colorScheme: 'light' }}
            />
          </div>

          <div className="space-y-2">
            <label
              className="uppercase tracking-widest"
              style={{ fontSize: 10, fontWeight: 700, color: 'var(--tgo-text-muted)' }}
            >
              Ciudad (opcional)
            </label>
            <input
              type="text"
              value={newAddress.city}
              onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
              placeholder="Buenos Aires"
              className={inputFocusStyle}
              style={{ ...inputStyle, colorScheme: 'light' }}
            />
          </div>

          <div className="space-y-2">
            <label
              className="uppercase tracking-widest"
              style={{ fontSize: 10, fontWeight: 700, color: 'var(--tgo-text-muted)' }}
            >
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
                className={inputFocusStyle}
                style={{ ...inputStyle, flex: 1, colorScheme: 'light' }}
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
                className={inputFocusStyle}
                style={{ ...inputStyle, flex: 1, colorScheme: 'light' }}
              />
            </div>
            <button
              type="button"
              onClick={() => { haptic.impact('light'); handleGetCurrentLocation() }}
              aria-label="Usar mi ubicación actual"
              className="w-full flex items-center justify-center gap-2 py-2 text-xs transition-colors"
              style={{
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-surface-1)',
                border: '1px solid var(--tgo-border)',
                color: 'var(--tgo-text-muted)',
              }}
            >
              <MapPin size={14} />
              Usar mi ubicación actual
            </button>
          </div>

          <button
            onClick={() => { haptic.success(); handleAddAddress() }}
            aria-label="Guardar dirección"
            disabled={adding || !newAddress.address || !newAddress.coordinates.lat || !newAddress.coordinates.lng}
            className="w-full py-3 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-state-action)',
            }}
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Dirección'}
          </button>
        </div>
      )}

      {!session?.user && savedAddresses.length === 0 && (
        <p className="text-center text-xs py-4" style={{ color: 'var(--tgo-text-muted)' }}>
          Iniciá sesión para guardar tus direcciones
        </p>
      )}
    </div>
  )
}
