'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, MessageCircle, Copy, Check, Send, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  apiPath: 'tenant' | 'superadmin'
  defaultMessageType: 'admin' | 'superadmin'
}

export default function WhatsappRewardAdvanceDialog({
  open,
  onOpenChange,
  tenantSlug,
  apiPath,
  defaultMessageType,
}: Props) {
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ sent: number; skipped: number; failed: number } | null>(null)
  const [sendingActive, setSendingActive] = useState(false)
  const [bulkQueue, setBulkQueue] = useState<any[]>([])
  const [bulkIndex, setBulkIndex] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [sosLimit, setSosLimit] = useState(0)

  const bulkAccRef = useRef({ sent: 0, skipped: 0, failed: 0 })
  const bulkQueueLengthRef = useRef(0)

  const baseUrl = apiPath === 'superadmin'
    ? '/api/superadmin/club/whatsapp-reward-advance'
    : `/api/${tenantSlug}/club/whatsapp-reward-advance`

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    try {
      const url = apiPath === 'superadmin'
        ? `${baseUrl}?action=list-members&tenantSlug=${tenantSlug}`
        : baseUrl
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMembers(data.members)
      setClubName(data.clubName)
      setSosLimit(data.sosLimit)
      setSelectedIds(new Set(data.members.map((m: any) => m._id)))
      if (data.members.length > 0) {
        const first = data.members[0]
        const items = first.eligibleItems.map((i: any) => `• ${i.name}`).join('\n')

        if (defaultMessageType === 'superadmin') {
          setMessage(
            `¡Hola ${first.name}! 🎉\n\nDesde TakeasyGO te informamos que con tus ${first.points} puntos y tu Reward Advance de ${data.sosLimit} puntos, ya podés canjear en ${data.clubName}:\n${items}\n\n¡Te esperamos!`
          )
        } else {
          setMessage(
            `¡Hola ${first.name}! 🎉\n\nDesde ${data.clubName} te informamos que con tus ${first.points} puntos y tu Reward Advance de ${data.sosLimit} puntos, ya podés canjear:\n${items}\n\n¡Te esperamos!`
          )
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar elegibles')
    } finally {
      setLoading(false)
    }
  }, [baseUrl, apiPath, tenantSlug, defaultMessageType])

  useEffect(() => {
    if (open) fetchMembers()
  }, [open, fetchMembers])

  const buildWhatsAppLink = (phone: string, name: string, message: string): string | null => {
    const clean = phone.replace(/[^\d]/g, '')
    if (!clean) return null
    return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`
  }

  const buildMemberMessage = (member: any): string => {
    const items = member.eligibleItems.map((i: any) => `• ${i.name}`).join('\n')
    return message
      .replace(/¡Hola [^!]+!/, `¡Hola ${member.name}!`)
      .replace(/con tus \d+ puntos/, `con tus ${member.points} puntos`)
      .replace(/canjear:\n[\s\S]*?\n\n/, `canjear:\n${items}\n\n`)
  }

  const handleCopyMessage = async (member: any) => {
    const msg = buildMemberMessage(member)
    await navigator.clipboard.writeText(msg)
    setCopiedId(member._id)
    toast.success('Mensaje copiado al portapapeles')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleBulkNext = () => {
    setBulkIndex((prev) => {
      const next = prev + 1
      if (next >= bulkQueueLengthRef.current) {
        setTimeout(() => {
          setSendingActive(false)
          setBulkQueue([])
          setResult({ ...bulkAccRef.current })
        }, 0)
      }
      return next
    })
  }

  const handleSendSingle = (member: any, opts?: { advanceBulk?: boolean }) => {
    const msg = buildMemberMessage(member)
    const link = buildWhatsAppLink(member.phone, member.name, msg)
    if (!link) {
      toast.error('Teléfono inválido')
      if (opts?.advanceBulk) {
        bulkAccRef.current.failed++
        handleBulkNext()
      }
      return
    }

    window.open(link, '_blank')

    fetch(baseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: String(member._id), tenantSlug }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || data.reason || 'Error al registrar intento')
        }
        return data
      })
      .then((data) => {
        if (data.ok === false) {
          toast.warning(
            `${member.name} ya no es elegible. Si enviaste el mensaje, avisale que fue un error.`
          )
          setMembers((prev) => prev.filter((m) => m._id !== member._id))
          if (opts?.advanceBulk) {
            bulkAccRef.current.skipped++
            handleBulkNext()
          }
          return
        }
        setMembers((prev) =>
          prev.map((m) =>
            m._id === member._id
              ? { ...m, lastAttemptedAt: data.lastAttemptedAt }
              : m
          )
        )
        if (opts?.advanceBulk) {
          bulkAccRef.current.sent++
          handleBulkNext()
        }
      })
      .catch(() => {
        toast.error('Error al registrar intento')
        if (opts?.advanceBulk) {
          bulkAccRef.current.failed++
          handleBulkNext()
        }
      })
  }

  const handleStartBulkSend = () => {
    const selected = members.filter((m) => selectedIds.has(m._id))
    if (selected.length === 0) {
      toast.error('Seleccioná al menos un miembro')
      return
    }
    bulkAccRef.current = { sent: 0, skipped: 0, failed: 0 }
    bulkQueueLengthRef.current = selected.length
    setBulkQueue(selected)
    setBulkIndex(0)
    setSendingActive(true)
    setResult(null)
    handleSendSingle(selected[0], { advanceBulk: true })
  }

  const handleClose = () => {
    onOpenChange(false)
    setSendingActive(false)
    setBulkQueue([])
    setBulkIndex(0)
    bulkQueueLengthRef.current = 0
    setResult(null)
  }

  if (!open) return null

  return (
    <Dialog open onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent aria-label="WhatsApp Club" className="max-w-lg rounded-[2rem] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle size={18} className="text-emerald-500" />
              Reward Advance — WhatsApp
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-xl h-8 w-8">
              <X size={16} />
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No hay miembros elegibles para Reward Advance
          </div>
        ) : (
          <>
            {/* Message preview */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                Mensaje (editable)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all resize-none"
              />
            </div>

            {/* Members list */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-60">
              {members.map((member) => {
                const isSelected = selectedIds.has(member._id)
                const waLink = buildWhatsAppLink(member.phone, member.name, buildMemberMessage(member))
                return (
                  <div key={member._id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(member._id)
                          else next.delete(member._id)
                          return next
                        })
                      }}
                      disabled={sendingActive}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">{member.name}</span>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {member.points.toLocaleString('es-AR')} pts
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {member.eligibleItems.length} item{member.eligibleItems.length !== 1 ? 's' : ''} con SOS
                        {member.lastAttemptedAt && (
                          <span className="ml-2 text-amber-600">
                            · enviado {new Date(member.lastAttemptedAt).toLocaleDateString('es-AR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendSingle(member)}
                        disabled={!waLink || sendingActive}
                        className="h-8 px-2 text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <Send size={12} className="mr-1" /> Enviar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyMessage(member)}
                        disabled={sendingActive}
                        className="h-8 px-2 text-[10px] font-bold text-muted-foreground hover:bg-muted/50"
                      >
                        {copiedId === member._id ? <Check size={12} className="mr-1 text-emerald-500" /> : <Copy size={12} className="mr-1" />}
                        {copiedId === member._id ? 'Copiado' : 'Copiar'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Bulk send result */}
            {result && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-sm">
                <span className="font-bold text-emerald-700">Envío completado:</span>{' '}
                {result.sent} enviado{result.sent !== 1 ? 's' : ''}
                {result.skipped > 0 && `, ${result.skipped} ya no elegible`}
                {result.failed > 0 && `, ${result.failed} fallido${result.failed !== 1 ? 's' : ''}`}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-border/60">
              {!sendingActive ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedIds(new Set(members.map(m => m._id)))
                    }}
                    className="rounded-xl h-9 text-xs font-bold"
                  >
                    Seleccionar todos
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleStartBulkSend}
                    disabled={selectedIds.size === 0}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl h-9 text-xs"
                  >
                    <Send size={14} className="mr-2" /> Iniciar envío ({selectedIds.size})
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground font-medium">
                    {bulkIndex + 1}/{bulkQueueLengthRef.current}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (bulkIndex < bulkQueueLengthRef.current) {
                        handleSendSingle(bulkQueue[bulkIndex], { advanceBulk: true })
                      }
                    }}
                    disabled={bulkIndex >= bulkQueueLengthRef.current}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl h-9 text-xs"
                  >
                    {bulkIndex >= bulkQueueLengthRef.current ? (
                      <><Check size={14} className="mr-2" /> Completado</>
                    ) : (
                      <><Send size={14} className="mr-2" /> Siguiente envío</>
                    )}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
