import { useState } from "react"
import { useAuth } from "../../hooks/useAuth"
import { createCustomer, type CreateCustomerInput } from "../../services/customers-api"

interface CreateCustomerModalProps {
  onCreated: (customerId: string, name: string) => void
  onClose: () => void
}

export function CreateCustomerModal({ onCreated, onClose }: CreateCustomerModalProps) {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jwt) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("El nombre es obligatorio")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const input: CreateCustomerInput = { name: trimmedName }
      if (phone.trim()) input.phone = phone.trim()
      if (email.trim()) input.email = email.trim()

      const result = await createCustomer(input, jwt)
      onCreated(result.customerId, result.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear cliente"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="customer-modal-overlay" onClick={onClose}>
      <div className="customer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="customer-modal-header">
          <div className="customer-modal-title">Nuevo cliente</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form className="customer-form" onSubmit={handleSubmit}>
          <div className="customer-form-field">
            <label className="customer-form-label">Nombre *</label>
            <input
              className="customer-form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del cliente"
              autoFocus
              disabled={saving}
            />
          </div>

          <div className="customer-form-field">
            <label className="customer-form-label">Teléfono</label>
            <input
              className="customer-form-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+54 11 5555-5555"
              disabled={saving}
            />
          </div>

          <div className="customer-form-field">
            <label className="customer-form-label">Email</label>
            <input
              className="customer-form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              disabled={saving}
            />
          </div>

          {error && (
            <div className="customer-alert">
              <div className="customer-alert-title">Error</div>
              <div className="customer-alert-text">{error}</div>
            </div>
          )}

          <div className="customer-form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !name.trim()}
            >
              {saving ? "Guardando..." : "Crear cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
